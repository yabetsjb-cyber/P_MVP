import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db';
import { config } from '../config';
import { hashToken } from '../lib/security';

export interface AuthCustomer {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  suspendedUntil: Date | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    customer?: AuthCustomer;
    customerTokenHash?: string;
  }
}

// "Bearer cst_" followed by exactly 43 URL-safe characters (what newToken() produces)
const BEARER = /^Bearer (cst_[A-Za-z0-9_-]{43})$/;

export async function authenticateCustomer(req: FastifyRequest, reply: FastifyReply) {
  const m = req.headers.authorization?.match(BEARER);
  if (!m) return reply.code(401).send({ error: 'UNAUTHENTICATED' });

  const hash = hashToken(m[1]);
  const { rows: [row] } = await pool.query(
    `SELECT c.id, c.email, c.full_name, c.phone, c.suspended_until
       FROM customer_sessions s
       JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND c.is_active`,
    [hash]
  );
  if (!row) return reply.code(401).send({ error: 'UNAUTHENTICATED' });

  req.customer = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    suspendedUntil: row.suspended_until,
  };
  req.customerTokenHash = hash;

  // Sliding expiry: renew at most once a day, without making the request wait for it
  pool
    .query(
      `UPDATE customer_sessions
          SET last_used_at = now(), expires_at = now() + make_interval(days => $2::int)
        WHERE token_hash = $1 AND last_used_at < now() - interval '1 day'`,
      [hash, config.customerSessionDays]
    )
    .catch(() => {});
}