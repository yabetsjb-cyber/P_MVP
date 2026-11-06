import type { FastifyInstance } from 'fastify';
import { config } from '../config';

export async function metaRoutes(app: FastifyInstance) {
  app.get('/v1/meta', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');   // changes rarely
    const S = config.search;
    const R = config.reservation;
    return {
      apiVersion: 1,
      timezone: 'Africa/Addis_Ababa',
      search: {
        defaultRadiusM: S.defaultRadiusM,
        maxRadiusM: S.maxRadiusM,
        maxReservable: S.maxReservable,
        lowStockAt: S.lowStockAt,
      },
      reservation: {
        respondMinutes: R.respondMinutes,
        pickupHours: R.pickupHours,
        maxActivePerCustomer: R.maxActivePerCustomer,
      },
      limits: { maxUploadMb: 5, maxImportRows: 5000 },
      telegramBotUsername: config.telegram.botUsername || null,   // for the "Connect Telegram" button
    };
  });
}