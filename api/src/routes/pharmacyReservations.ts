import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate';
import { authenticate, requireRole, requirePharmacy } from '../plugins/auth';
import {
  ConfirmBody, DeclineBody, CodeBody,
  listForPharmacy, summaryForPharmacy, lookupByCode,
  confirmReservation, declineReservation, fulfilReservation,
} from '../services/pharmacyReservations';

const IdParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  scope: z.enum(['pending', 'confirmed', 'active', 'past', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function pharmacyReservationRoutes(app: FastifyInstance) {
  const member = [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff'), requirePharmacy];
  const counter = { preHandler: member, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  // --- Dashboard badge: poll this every ~10 seconds ---
  app.get('/v1/pharmacy/reservations/summary', { preHandler: member }, async (req) =>
    summaryForPharmacy(req.user!.pharmacyId!));

  // --- The list (most urgent requests first) ---
  app.get('/v1/pharmacy/reservations', { preHandler: member }, async (req) => {
    const q = parse(ListQuery, req.query);
    return { reservations: await listForPharmacy(req.user!.pharmacyId!, q.scope, q.limit, q.offset) };
  });

  // --- Step 1 of pickup: the customer reads out a code ---
  app.post('/v1/pharmacy/reservations/lookup', counter, async (req) => {
    const b = parse(CodeBody, req.body);
    return lookupByCode(req.user!.pharmacyId!, b.code);
  });

  // --- Confirm (body optional, e.g. {"holdMinutes": 45}) ---
  app.post('/v1/pharmacy/reservations/:id/confirm', { preHandler: member }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const b = parse(ConfirmBody, req.body ?? {});
    return { reservation: await confirmReservation(req.user!.pharmacyId!, req.user!.id, id, b.holdMinutes) };
  });

  // --- Decline with a reason ---
  app.post('/v1/pharmacy/reservations/:id/decline', { preHandler: member }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const b = parse(DeclineBody, req.body);
    return declineReservation(req.user!.pharmacyId!, req.user!.id, id, b);
  });

  // --- Step 2 of pickup: hand over the medicine ---
  app.post('/v1/pharmacy/reservations/:id/fulfil', counter, async (req) => {
    const { id } = parse(IdParams, req.params);
    const b = parse(CodeBody, req.body);
    return { reservation: await fulfilReservation(req.user!.pharmacyId!, req.user!.id, id, b.code) };
  });
}