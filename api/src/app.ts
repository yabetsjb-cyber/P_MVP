import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config';
import { pool } from './db';
import { HttpError } from './lib/errors';
import { authRoutes } from './routes/auth';
import { pharmacyRoutes } from './routes/pharmacy';
import { adminRoutes } from './routes/admin';
import { inventoryRoutes } from './routes/inventory';
import { importRoutes } from './routes/imports';
import { catalogRequestRoutes } from './routes/catalogRequests';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });

  // Our own errors become clean JSON. Anything unexpected is logged in full
  // but the client only sees a generic message (no internals leaked).
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.code, ...err.extra });
    }
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(500).send({ error: 'INTERNAL' });
    }
    return reply.code(status).send({ error: err.code ?? err.message });
  });

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
  await app.register(inventoryRoutes);
  await app.register(importRoutes); 
  await app.register(catalogRequestRoutes);

  return app;
}