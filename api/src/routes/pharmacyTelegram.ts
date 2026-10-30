import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { tx } from '../lib/tx';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { parse } from '../lib/validate';
import { newToken, hashToken } from '../lib/security';
import { authenticate, requireRole, requirePharmacy } from '../plugins/auth';
import { notifyPharmacyTest } from '../services/notifications';

const ChatParams = z.object({ chatId: z.string().regex(/^-?\d{1,18}$/) });

export async function pharmacyTelegramRoutes(app: FastifyInstance) {
  const member = [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff'), requirePharmacy];

  // --- Step 1 of linking: get a one-time link (send no request body) ---
  app.post(
    '/v1/pharmacy/telegram/link-token',
    { preHandler: member, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req) => {
      const token = newToken();   // 43 URL-safe characters: fits Telegram's 64-character start parameter
      const { rows: [t] } = await pool.query(
        `INSERT INTO telegram_link_tokens (token_hash, pharmacy_id, user_id, expires_at)
         VALUES ($1,$2,$3, now() + make_interval(mins => $4::int)) RETURNING expires_at`,
        [hashToken(token), req.user!.pharmacyId, req.user!.id, config.telegram.linkTokenMinutes]
      );
      const bot = config.telegram.botUsername;
      return { token, url: bot ? `https://t.me/${bot}?start=${token}` : null, expiresAt: t.expires_at };
    }
  );

  // --- Which chats receive my pharmacy's alerts ---
  app.get('/v1/pharmacy/telegram', { preHandler: member }, async (req) => {
    const { rows } = await pool.query(
      `SELECT l.chat_id::text AS chat_id, l.label, l.linked_at, u.full_name AS linked_by
         FROM telegram_links l LEFT JOIN users u ON u.id = l.user_id
        WHERE l.pharmacy_id = $1 ORDER BY l.linked_at`,
      [req.user!.pharmacyId]
    );
    return {
      botConfigured: !!config.telegram.botToken,
      links: rows.map((r) => ({ chatId: r.chat_id, label: r.label, linkedAt: r.linked_at, linkedBy: r.linked_by })),
    };
  });

  // --- Unlink a chat (owners: any chat of the pharmacy. Staff: only their own) ---
  app.delete('/v1/pharmacy/telegram/:chatId', { preHandler: member }, async (req) => {
    const { chatId } = parse(ChatParams, req.params);
    const isOwner = req.user!.role === 'pharmacy_owner';
    const { rowCount } = await pool.query(
      `DELETE FROM telegram_links
        WHERE chat_id = $1 AND pharmacy_id = $2 AND ($3::boolean OR user_id = $4)`,
      [chatId, req.user!.pharmacyId, isOwner, req.user!.id]
    );
    if (!rowCount) throw new HttpError(404, 'LINK_NOT_FOUND');
    return { ok: true };
  });

  // --- "Send a test alert" button ---
  app.post(
    '/v1/pharmacy/telegram/test',
    { preHandler: member, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req) => {
      const queuedTo = await tx(async (c) => {
        await notifyPharmacyTest(c, req.user!.pharmacyId!);
        const { rows: [x] } = await c.query(
          'SELECT count(*)::int AS n FROM telegram_links WHERE pharmacy_id = $1', [req.user!.pharmacyId]);
        return x.n as number;
      });
      return { queuedTo };
    }
  );
}