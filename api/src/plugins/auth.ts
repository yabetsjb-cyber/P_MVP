import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db';
import { config } from '../config';
import { hashToken } from '../lib/security';

export type Role = 'pharmacy_owner' | 'pharmacy_staff' | 'platform_admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  pharmacyId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// Guard 1: must be logged in. Fills req.user.
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[config.cookieName];
  if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.pharmacy_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
    [hashToken(token)]
  );

  if (!rows[0]) {
    reply.clearCookie(config.cookieName, { path: '/' });
    return reply.code(401).send({ error: 'UNAUTHENTICATED' });
  }

  req.user = {
    id: rows[0].id,
    email: rows[0].email,
    fullName: rows[0].full_name,
    role: rows[0].role,
    pharmacyId: rows[0].pharmacy_id,
  };
}

// Guard 2: must have one of the listed roles. Use AFTER authenticate.
export const requireRole =
  (...roles: Role[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
  };
// Must belong to a pharmacy. Use AFTER authenticate.
export async function requirePharmacy(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user?.pharmacyId) return reply.code(409).send({ error: 'NO_PHARMACY' });
}
