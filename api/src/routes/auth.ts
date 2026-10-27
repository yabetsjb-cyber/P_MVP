import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { pool } from '../db';
import { config } from '../config';
import { newToken, hashToken } from '../lib/security';
import { normalizeEthiopianPhone } from '../lib/phone';
import { parseBody } from '../lib/validate';
import { authenticate } from '../plugins/auth';

// Hash a fake password once at startup. For unknown emails we still verify
// against it, so login takes the same time whether or not the account exists.
const dummyHash = argon2.hash('not-a-real-password');

const cookieOpts = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: config.sessionDays * 86400, // seconds
};

async function startSession(req: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), userId, expiresAt, req.ip, req.headers['user-agent']?.slice(0, 300) ?? null]
  );
  reply.setCookie(config.cookieName, token, cookieOpts);
}

const RegisterBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, 'At least 10 characters').max(128),
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const p = normalizeEthiopianPhone(v);
      if (!p) {
        ctx.addIssue({ code: 'custom', message: 'Invalid Ethiopian mobile number' });
        return z.NEVER;
      }
      return p;
    }),
});

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export async function authRoutes(app: FastifyInstance) {
  // --- Register a pharmacy owner account ---
  app.post(
    '/v1/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = parseBody(RegisterBody, req.body, reply);
      if (!body) return;

      const hash = await argon2.hash(body.password); // argon2id by default
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, full_name, phone, role)
           VALUES ($1, $2, $3, $4, 'pharmacy_owner')
           RETURNING id, email, full_name, role, pharmacy_id`,
          [body.email, hash, body.fullName, body.phone]
        );
        await startSession(req, reply, rows[0].id);
        return reply.code(201).send({
          user: {
            id: rows[0].id,
            email: rows[0].email,
            fullName: rows[0].full_name,
            role: rows[0].role,
            pharmacyId: rows[0].pharmacy_id,
          },
        });
      } catch (e: any) {
        if (e.code === '23505') return reply.code(409).send({ error: 'EMAIL_IN_USE' });
        throw e;
      }
    }
  );

  // --- Login ---
  app.post(
    '/v1/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parseBody(LoginBody, req.body, reply);
      if (!body) return;

      const { rows } = await pool.query(
        `SELECT id, email, full_name, password_hash, role, pharmacy_id, is_active
           FROM users WHERE lower(email) = $1`,
        [body.email]
      );
      const u = rows[0];

      const ok = await argon2
        .verify(u?.password_hash ?? (await dummyHash), body.password)
        .catch(() => false);

      if (!u || !u.is_active || !ok) {
        return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
      }

      await startSession(req, reply, u.id);
      return {
        user: {
          id: u.id,
          email: u.email,
          fullName: u.full_name,
          role: u.role,
          pharmacyId: u.pharmacy_id,
        },
      };
    }
  );

  // --- Who am I? ---
  app.get('/v1/auth/me', { preHandler: authenticate }, async (req) => ({ user: req.user }));

  // --- Logout ---
  app.post('/v1/auth/logout', async (req, reply) => {
    const token = req.cookies[config.cookieName];
    if (token) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    }
    reply.clearCookie(config.cookieName, { path: '/' });
    return { ok: true };
  });
}
