import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { parse } from '../lib/validate';
import { authenticateCustomer } from '../plugins/customerAuth';
import { createReservation, listMine, getMine, cancelMine } from '../services/reservations';

const IdParams = z.object({ id: z.string().uuid() });

const CreateBody = z
  .object({
    inventoryId: z.string().uuid(),
    qty: z.number().int().min(1).max(config.search.maxReservable),
  })
  .strict();

const ListQuery = z.object({
  scope: z.enum(['active', 'past', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function customerReservationRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticateCustomer };

  // --- Request a reservation (holds the stock) ---
  app.post(
    '/v1/customer/reservations',
    { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const b = parse(CreateBody, req.body);
      const reservation = await createReservation(req.customer!.id, b);
      return reply.code(201).send({ reservation });
    }
  );

  // --- My reservations (active ones by default) ---
  app.get('/v1/customer/reservations', auth, async (req) => {
    const q = parse(ListQuery, req.query);
    return { reservations: await listMine(req.customer!.id, q.scope, q.limit, q.offset) };
  });

  // --- One reservation with its timeline ---
  app.get('/v1/customer/reservations/:id', auth, async (req) => {
    const { id } = parse(IdParams, req.params);
    return { reservation: await getMine(req.customer!.id, id) };
  });

  // --- Cancel (no request body) ---
  app.post('/v1/customer/reservations/:id/cancel', auth, async (req) => {
    const { id } = parse(IdParams, req.params);
    return { reservation: await cancelMine(req.customer!.id, id) };
  });
}