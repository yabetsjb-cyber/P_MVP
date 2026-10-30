import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db';
import { tx } from '../lib/tx';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { addEvent, releaseHold } from './reservations';
import { markOutOfStock, touchPharmacy } from './inventory';
import { notifyReservation } from './notifications';

const R = config.reservation;

// ---------- Input schemas ----------
export const ConfirmBody = z
  .object({ holdMinutes: z.number().int().min(30).max(240).optional() })
  .strict();

export const DeclineBody = z
  .object({
    reason: z.enum(['out_of_stock', 'closed', 'other']),
    note: z.string().trim().min(3).max(200).optional(),
    alsoMarkOutOfStock: z.boolean().optional(),   // only with out_of_stock; default true there
  })
  .strict()
  .refine((b) => b.reason !== 'other' || !!b.note,
          { message: 'A note is required when the reason is "other"', path: ['note'] })
  .refine((b) => b.alsoMarkOutOfStock === undefined || b.reason === 'out_of_stock',
          { message: 'Only valid with reason "out_of_stock"', path: ['alsoMarkOutOfStock'] });

export const CodeBody = z.object({ code: z.string().trim().min(4).max(14) }).strict();

// "k7m-2qd", "K7M 2QD" and "k7m2qd" are the same code. Our alphabet has no I, L or O.
export function normalizeCode(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 6) throw new HttpError(400, 'INVALID_CODE');
  return s;
}

// ---------- What the pharmacy sees (no pickup code, phone only while active) ----------
const VIEW_SQL = `
  SELECT r.id, r.status, r.qty, r.requires_prescription, r.respond_by, r.pickup_by,
         r.decline_reason, r.closed_reason, r.created_at, r.confirmed_at, r.fulfilled_at, r.closed_at,
         (r.status IN ('requested','confirmed')) AS is_active,
         m.id AS medicine_id, m.brand_name, m.generic_name, m.strength, m.pack_size,
         c.full_name AS customer_name, c.phone AS customer_phone, c.no_show_count
    FROM reservations r
    JOIN medicines m ON m.id = r.medicine_id
    JOIN customers c ON c.id = r.customer_id`;

const view = (r: any) => ({
  id: r.id,
  status: r.status,
  qty: r.qty,
  requiresPrescription: r.requires_prescription,
  respondBy: r.respond_by,
  pickupBy: r.pickup_by,
  createdAt: r.created_at,
  confirmedAt: r.confirmed_at,
  fulfilledAt: r.fulfilled_at,
  closedAt: r.closed_at,
  declineReason: r.decline_reason,
  closedReason: r.closed_reason,
  medicine: {
    id: r.medicine_id, brandName: r.brand_name, genericName: r.generic_name,
    strength: r.strength, packSize: r.pack_size,
  },
  customer: {
    name: r.customer_name,
    phone: r.is_active ? r.customer_phone : null,
    phoneVerified: false,
    noShowCount: r.no_show_count,
  },
});

async function viewById(c: PoolClient, id: string) {
  const { rows: [r] } = await c.query(`${VIEW_SQL} WHERE r.id = $1`, [id]);
  return view(r);
}

// ---------- Read ----------
export type Scope = 'pending' | 'confirmed' | 'active' | 'past' | 'all';

export async function listForPharmacy(pharmacyId: string, scope: Scope, limit: number, offset: number) {
  const { rows } = await pool.query(
    `${VIEW_SQL}
      WHERE r.pharmacy_id = $1
        AND ($2 = 'all'
             OR ($2 = 'pending'   AND r.status = 'requested')
             OR ($2 = 'confirmed' AND r.status = 'confirmed')
             OR ($2 = 'active'    AND r.status IN ('requested','confirmed'))
             OR ($2 = 'past'      AND r.status NOT IN ('requested','confirmed')))
      ORDER BY (r.status = 'requested') DESC,
               CASE WHEN r.status = 'requested' THEN r.respond_by END ASC,
               r.created_at DESC
      LIMIT $3 OFFSET $4`,
    [pharmacyId, scope, limit, offset]
  );
  return rows.map(view);
}

// Cheap enough to poll every 10 seconds
export async function summaryForPharmacy(pharmacyId: string) {
  const { rows: [s] } = await pool.query(
    `SELECT count(*) FILTER (WHERE status = 'requested')::int AS requested,
            count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
            min(respond_by) FILTER (WHERE status = 'requested') AS next_respond_by,
            now() AS server_time
       FROM reservations
      WHERE pharmacy_id = $1 AND status IN ('requested','confirmed')`,
    [pharmacyId]
  );
  return {
    requested: s.requested, confirmed: s.confirmed,
    nextRespondBy: s.next_respond_by, serverTime: s.server_time,
  };
}

// "The customer is at the counter and read out a code": show who and what, before anything changes
export async function lookupByCode(pharmacyId: string, code: string) {
  const norm = normalizeCode(code);
  const { rows: [r] } = await pool.query(
    `${VIEW_SQL} WHERE r.pharmacy_id = $1 AND r.code = $2 AND r.status IN ('requested','confirmed')`,
    [pharmacyId, norm]
  );
  if (!r) throw new HttpError(404, 'CODE_NOT_FOUND');
  return { reservation: view(r), readyForPickup: r.status === 'confirmed' };
}

// ---------- Shared helpers ----------
// Lock one of THIS pharmacy's reservations. The pharmacy_id condition is the tenant check.
async function lockOwn(c: PoolClient, pharmacyId: string, id: string) {
  const { rows: [r] } = await c.query(
    `SELECT id, code, status, inventory_id, qty, (respond_by <= now()) AS respond_passed
       FROM reservations WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE`,
    [id, pharmacyId]
  );
  if (!r) throw new HttpError(404, 'RESERVATION_NOT_FOUND');
  return r;
}

// Close an ACTIVE reservation without a sale: give the units back and record why.
// Step 9e (expiry) reuses this.
export async function closeActive(
  c: PoolClient,
  r: { id: string; inventory_id: string; qty: number },
  status: 'declined' | 'cancelled' | 'expired',
  closedReason: string,
  actor: { type: 'customer' | 'pharmacy' | 'system'; id: string | null },
  opts: { declineReason?: string | null; note?: string | null } = {}
) {
  await releaseHold(c, r.inventory_id, r.qty);
  await c.query(
    `UPDATE reservations
        SET status = $2, closed_at = now(), closed_reason = $3, decline_reason = $4
      WHERE id = $1`,
    [r.id, status, closedReason, opts.declineReason ?? null]
  );
  await addEvent(c, r.id, status, actor.type, actor.id, opts.note ?? null);
}

// ---------- Confirm ----------
export async function confirmReservation(
  pharmacyId: string, userId: string, id: string, holdMinutes?: number
) {
  return tx(async (c) => {
    const { rows: [p] } = await c.query('SELECT status FROM pharmacies WHERE id = $1', [pharmacyId]);
    if (p?.status !== 'verified') throw new HttpError(403, 'PHARMACY_NOT_VERIFIED');

    const r = await lockOwn(c, pharmacyId, id);
    if (r.status !== 'requested') throw new HttpError(409, 'INVALID_STATE', { status: r.status });
    if (r.respond_passed) throw new HttpError(409, 'RESPONSE_WINDOW_PASSED');

    await c.query(
      `UPDATE reservations
          SET status = 'confirmed', confirmed_at = now(),
              pickup_by = now() + make_interval(mins => $2::int)
        WHERE id = $1`,
      [id, holdMinutes ?? R.pickupHours * 60]
    );
    await addEvent(c, id, 'confirmed', 'pharmacy', userId);
    await notifyReservation(c, id, 'confirmed');
    return viewById(c, id);
  });
}

// ---------- Decline ----------
export async function declineReservation(
  pharmacyId: string, userId: string, id: string, b: z.infer<typeof DeclineBody>
) {
  return tx(async (c) => {
    const r = await lockOwn(c, pharmacyId, id);
    if (r.status !== 'requested' && r.status !== 'confirmed') {
      throw new HttpError(409, 'INVALID_STATE', { status: r.status });
    }

    await closeActive(c, r, 'declined', 'pharmacy_declined', { type: 'pharmacy', id: userId }, {
      declineReason: b.reason,
      note: b.note ? `${b.reason}: ${b.note}` : b.reason,
    });

    await notifyReservation(c, id, 'declined'); 
    // "Out of stock" means our numbers were wrong: fix them so nobody else is sent here
    let markedOutOfStock = false;
    if (b.reason === 'out_of_stock' && b.alsoMarkOutOfStock !== false) {
      await markOutOfStock(c, pharmacyId, r.inventory_id);
      await touchPharmacy(c, pharmacyId);
      markedOutOfStock = true;
    }
    return { reservation: await viewById(c, id), markedOutOfStock };
  });
}

// ---------- Fulfil (customer collected the medicine) ----------
export async function fulfilReservation(pharmacyId: string, userId: string, id: string, code: string) {
  const norm = normalizeCode(code);
  return tx(async (c) => {
    const r = await lockOwn(c, pharmacyId, id);
    if (r.status === 'requested') throw new HttpError(409, 'NOT_CONFIRMED', { hint: 'Confirm the reservation first.' });
    if (r.status !== 'confirmed') throw new HttpError(409, 'INVALID_STATE', { status: r.status });
    if (r.code !== norm) throw new HttpError(403, 'WRONG_CODE');

    // The sale: units leave the shelf AND the hold. updated_at is deliberately left alone.
    await c.query(
      `UPDATE inventory
          SET qty_on_hand     = qty_on_hand - $2,
              qty_reserved    = qty_reserved - $2,
              is_out_of_stock = is_out_of_stock OR (qty_on_hand - $2 = 0)
        WHERE id = $1 AND pharmacy_id = $3`,
      [r.inventory_id, r.qty, pharmacyId]
    );
    await c.query(
      `UPDATE reservations
          SET status = 'fulfilled', fulfilled_at = now(), closed_at = now(), closed_reason = 'picked_up'
        WHERE id = $1`,
      [id]
    );
    await addEvent(c, id, 'fulfilled', 'pharmacy', userId);
    return viewById(c, id);
  });
}