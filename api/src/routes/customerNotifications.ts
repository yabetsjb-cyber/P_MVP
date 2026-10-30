import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { parse } from '../lib/validate';
import { authenticateCustomer } from '../plugins/customerAuth';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  before: z.coerce.number().int().positive().optional(),     // paging: ids older than this
});
const ReadBody = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => (b.ids ? 1 : 0) + (b.all ? 1 : 0) === 1, 'Send either "ids" or "all": true');

const PushBody = z
  .object({
    token: z.string().min(20).max(4096),
    platform: z.enum(['android', 'ios']),
    deviceName: z.string().trim().max(80).optional(),
  })
  .strict();
const RemoveBody = z.object({ token: z.string().min(20).max(4096) }).strict();

export async function customerNotificationRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticateCustomer };

  // --- Inbox (newest first) ---
  app.get('/v1/customer/notifications', auth, async (req) => {
    const q = parse(ListQuery, req.query);
    const id = req.customer!.id;
    const { rows } = await pool.query(
      `SELECT id, type, title, body, data, read_at, created_at
         FROM notifications
        WHERE customer_id = $1 AND ($2::bigint IS NULL OR id < $2)
        ORDER BY id DESC LIMIT $3`,
      [id, q.before ?? null, q.limit]
    );
    const { rows: [u] } = await pool.query(
      'SELECT count(*)::int AS n FROM notifications WHERE customer_id = $1 AND read_at IS NULL', [id]);
    return {
      unreadCount: u.n,
      notifications: rows.map((n) => ({
        id: Number(n.id), type: n.type, title: n.title, body: n.body,
        data: n.data, readAt: n.read_at, createdAt: n.created_at,
      })),
      nextBefore: rows.length === q.limit ? Number(rows[rows.length - 1].id) : null,
    };
  });

  // --- Just the badge number ---
  app.get('/v1/customer/notifications/unread-count', auth, async (req) => {
    const { rows: [u] } = await pool.query(
      'SELECT count(*)::int AS n FROM notifications WHERE customer_id = $1 AND read_at IS NULL',
      [req.customer!.id]);
    return { unreadCount: u.n };
  });

  // --- Mark some, or all, as read ---
  app.post('/v1/customer/notifications/read', auth, async (req) => {
    const b = parse(ReadBody, req.body);
    const { rowCount } = await pool.query(
      `UPDATE notifications SET read_at = now()
        WHERE customer_id = $1 AND read_at IS NULL AND ($2::bigint[] IS NULL OR id = ANY($2::bigint[]))`,
      [req.customer!.id, b.ids ?? null]
    );
    return { marked: rowCount ?? 0 };
  });

  // --- The app registers its push token after every login ---
  app.put(
    '/v1/customer/push-token',
    { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req) => {
      const b = parse(PushBody, req.body);
      const customerId = req.customer!.id;
      await pool.query(
        `INSERT INTO push_tokens (token, customer_id, session_token_hash, platform, device_name)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (token) DO UPDATE
           SET customer_id = EXCLUDED.customer_id, session_token_hash = EXCLUDED.session_token_hash,
               platform = EXCLUDED.platform, device_name = EXCLUDED.device_name, last_seen_at = now()`,
        [b.token, customerId, req.customerTokenHash, b.platform, b.deviceName ?? null]
      );
      // Keep only the 10 most recent devices
      await pool.query(
        `DELETE FROM push_tokens
          WHERE customer_id = $1
            AND token NOT IN (SELECT token FROM push_tokens WHERE customer_id = $1
                               ORDER BY last_seen_at DESC LIMIT 10)`,
        [customerId]
      );
      return { ok: true };
    }
  );

  // --- Stop pushes to a device (POST, because not every mobile HTTP client can send a DELETE body) ---
  app.post('/v1/customer/push-token/remove', auth, async (req) => {
    const b = parse(RemoveBody, req.body);
    await pool.query('DELETE FROM push_tokens WHERE token = $1 AND customer_id = $2', [b.token, req.customer!.id]);
    return { ok: true };
  });
}