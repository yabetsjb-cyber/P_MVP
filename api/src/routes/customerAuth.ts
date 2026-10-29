import type { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { pool } from '../db';
import { tx } from '../lib/tx';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { audit } from '../lib/audit';
import { newToken, hashToken } from '../lib/security';
import { parse, optionalEthiopianPhone } from '../lib/validate';
import { authenticateCustomer } from '../plugins/customerAuth';

// For unknown emails we still verify against this, so login takes the same time either way
const dummyHash = argon2.hash('not-a-real-password');

const MAX_SESSIONS = 10;

const email = z.string().trim().toLowerCase().email().max(254);
const deviceName = z.string().trim().max(80).optional();

const RegisterBody = z
  .object({
    email,
    password: z.string().min(10, 'At least 10 characters').max(128),
    fullName: z.string().trim().min(2).max(100),
    phone: optionalEthiopianPhone,
    deviceName,
  })
  .strict();

const LoginBody = z
  .object({ email, password: z.string().min(1).max(128), deviceName })
  .strict();

const PatchBody = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    phone: optionalEthiopianPhone,
  })
  .strict()
  .refine((b) => b.fullName !== undefined || b.phone !== undefined, 'Nothing to update');

const DeleteBody = z.object({ password: z.string().min(1).max(128) }).strict();

const customerView = (c: any) => ({
  id: c.id,
  email: c.email,
  fullName: c.full_name,
  phone: c.phone,
  suspendedUntil: c.suspended_until ?? null,
});

async function issueSession(req: FastifyRequest, customerId: string, device?: string) {
  const token = 'cst_' + newToken();
  const expiresAt = new Date(Date.now() + config.customerSessionDays * 86_400_000);
  await pool.query(
    `INSERT INTO customer_sessions (token_hash, customer_id, expires_at, device_name, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [hashToken(token), customerId, expiresAt, device ?? null, req.ip,
     req.headers['user-agent']?.slice(0, 300) ?? null]
  );
  // Keep only the newest MAX_SESSIONS sessions per customer
  await pool.query(
    `DELETE FROM customer_sessions
      WHERE customer_id = $1
        AND token_hash NOT IN (SELECT token_hash FROM customer_sessions
                                WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [customerId, MAX_SESSIONS]
  );
  return { token, expiresAt };
}

export async function customerAuthRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticateCustomer };

  // --- Register ---
  app.post(
    '/v1/customer/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const b = parse(RegisterBody, req.body);
      const hash = await argon2.hash(b.password);
      try {
        const { rows: [c] } = await pool.query(
          `INSERT INTO customers (email, password_hash, full_name, phone)
           VALUES ($1,$2,$3,$4)
           RETURNING id, email, full_name, phone, suspended_until`,
          [b.email, hash, b.fullName, b.phone ?? null]
        );
        const session = await issueSession(req, c.id, b.deviceName);
        return reply.code(201).send({ ...session, customer: customerView(c) });
      } catch (e: any) {
        if (e.code === '23505') throw new HttpError(409, 'EMAIL_IN_USE');
        throw e;
      }
    }
  );

  // --- Login ---
  app.post(
    '/v1/customer/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const b = parse(LoginBody, req.body);
      const { rows: [c] } = await pool.query(
        `SELECT id, email, full_name, phone, suspended_until, password_hash, is_active
           FROM customers WHERE lower(email) = $1`,
        [b.email]
      );
      const ok = await argon2
        .verify(c?.password_hash ?? (await dummyHash), b.password)
        .catch(() => false);
      if (!c || !c.is_active || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS');

      const session = await issueSession(req, c.id, b.deviceName);
      return { ...session, customer: customerView(c) };
    }
  );

  // --- Log out this device ---
  app.post('/v1/customer/auth/logout', auth, async (req) => {
    await pool.query('DELETE FROM customer_sessions WHERE token_hash = $1', [req.customerTokenHash]);
    return { ok: true };
  });

  // --- Log out every device ---
  app.post('/v1/customer/auth/logout-all', auth, async (req) => {
    await pool.query('DELETE FROM customer_sessions WHERE customer_id = $1', [req.customer!.id]);
    return { ok: true };
  });

  // --- My profile ---
  app.get('/v1/customer/me', auth, async (req) => ({
    customer: {
      id: req.customer!.id,
      email: req.customer!.email,
      fullName: req.customer!.fullName,
      phone: req.customer!.phone,
      suspendedUntil: req.customer!.suspendedUntil,
    },
  }));

  app.patch('/v1/customer/me', auth, async (req) => {
    const b = parse(PatchBody, req.body);
    const { rows: [c] } = await pool.query(
      `UPDATE customers
          SET full_name = COALESCE($2, full_name),
              phone     = CASE WHEN $3::boolean THEN $4 ELSE phone END
        WHERE id = $1
        RETURNING id, email, full_name, phone, suspended_until`,
      [req.customer!.id, b.fullName ?? null, b.phone !== undefined, b.phone ?? null]
    );
    return { customer: customerView(c) };
  });

  // --- Delete my account: removes personal details and every session ---
  app.post(
    '/v1/customer/delete-account',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req) => {
      const b = parse(DeleteBody, req.body);
      const id = req.customer!.id;
      await tx(async (c) => {
        const { rows: [row] } = await c.query(
          'SELECT password_hash FROM customers WHERE id = $1 FOR UPDATE', [id]);
        const ok = row?.password_hash && (await argon2.verify(row.password_hash, b.password).catch(() => false));
        if (!ok) throw new HttpError(403, 'WRONG_PASSWORD');

        await c.query('DELETE FROM customer_sessions WHERE customer_id = $1', [id]);
        // The row stays (reservation history will point at it) but holds no personal data
        await c.query(
          `UPDATE customers
              SET email = 'deleted-' || id::text || '@deleted.invalid',
                  full_name = 'Deleted account', phone = NULL, password_hash = NULL,
                  auth_provider = 'deleted', provider_sub = NULL, is_active = false
            WHERE id = $1`,
          [id]
        );
        await audit(c, null, 'customer.deleted', 'customer', id);
      });
      return { deleted: true };
    }
  );
}