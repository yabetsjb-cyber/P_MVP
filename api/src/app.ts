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
import { searchRoutes } from './routes/search';
import { customerAuthRoutes } from './routes/customerAuth';
import { customerReservationRoutes } from './routes/customerReservations';
import { pharmacyReservationRoutes } from './routes/pharmacyReservations';
import { customerNotificationRoutes } from './routes/customerNotifications';
import { pharmacyTelegramRoutes } from './routes/pharmacyTelegram';
import { devRoutes } from './routes/devTools';
import cors from '@fastify/cors';
import { metaRoutes } from './routes/meta';


export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
    await app.register(cors, {
    origin: config.allowedOrigins,                 // exact matches only, never "*"
    credentials: true,                             // lets the dashboard's session cookie travel
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Retry-After'],               // so the browser can read it on a 429
    maxAge: 600,                                   // browsers may cache the preflight answer for 10 minutes
  });
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
    if (status === 429) return reply.code(429).send({ error: 'RATE_LIMITED' });
    if (typeof err.code === 'string' && err.code.startsWith('FST_ERR_CTP')) {
      return reply.code(status).send({ error: 'INVALID_BODY' });   // malformed or empty JSON, wrong content type
    }
    return reply.code(status).send({ error: err.code ?? err.message });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'ROUTE_NOT_FOUND' }));
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
  await app.register(searchRoutes);
  await app.register(customerAuthRoutes);
  await app.register(customerReservationRoutes);
  await app.register(pharmacyReservationRoutes);
  await app.register(customerNotificationRoutes);
  await app.register(pharmacyTelegramRoutes);
  await app.register(devRoutes);
  await app.register(metaRoutes);

  return app;
}