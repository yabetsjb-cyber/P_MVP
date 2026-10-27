import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { pool } from './db';
import { authRoutes } from './routes/auth';
import { authenticate, requireRole } from './plugins/auth';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });

  await app.register(cookie);
  await app.register(rateLimit, { global: false }); // only routes that opt in

  // Basic CSRF defence: browsers always send an Origin header on cross-site
  // POSTs. If it's present and not ours, reject. (curl sends none, so it passes.)
  app.addHook('onRequest', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'BAD_ORIGIN' });
    }
  });

  app.get('/health', async () => {
    const { rows } = await pool.query('SELECT postgis_version() AS postgis, now() AS db_time');
    return { ok: true, ...rows[0] };
  });

  await app.register(authRoutes);

  // Temporary routes to prove the role guards work. We'll delete these later.
  app.get('/v1/admin/ping', { preHandler: [authenticate, requireRole('platform_admin')] }, async () => ({ pong: 'admin' }));
  app.get('/v1/pharmacy/ping', { preHandler: [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff')] }, async (req) => ({ pong: 'pharmacy', pharmacyId: req.user!.pharmacyId }));

  return app;
}
