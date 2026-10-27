import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config';
import { pool } from './db';
import { authRoutes } from './routes/auth';
import { pharmacyRoutes } from './routes/pharmacy';
import { adminRoutes } from './routes/admin';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });

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
  await app.register(pharmacyRoutes);
  await app.register(adminRoutes);

  return app;
}