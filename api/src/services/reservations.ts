import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
import { tx } from '../lib/tx';
import { config } from '../config';
import { HttpError } from '../lib/errors';

const R = config.reservation;
const S = config.search;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U: easy to read aloud
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(32)]).join('');

// ---------- Shared pieces (the pharmacy side in 9c reuses these) ----------
const VIEW_SQL = `
  SELECT r.id, r.code, r.status, r.qty, r.requires_prescription, r.respond_by, r.pickup_by,
         r.decline_reason, r.closed_reason, r.created_at, r.confirmed_at, r.fulfilled_at, r.closed_at,
         m.id AS medicine_id, m.brand_name, m.generic_name, m.strength, m.pack_size,
         p.id AS pharmacy_id, p.name AS pharmacy_name, p.phone AS pharmacy_phone,
         p.address AS pharmacy_address, p.subcity,
         ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
    FROM reservations r
    JOIN medicines  m ON m.id = r.medicine_id
    JOIN pharmacies p ON p.id = r.pharmacy_id`;

export function reservationView(r: any) {
  return {
    id: r.id,
    code: r.code,
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
    pharmacy: {
      id: r.pharmacy_id, name: r.pharmacy_name, phone: r.pharmacy_phone,
      address: r.pharmacy_address, subcity: r.subcity, lat: r.lat, lng: r.lng,
    },
  };
}

export async function addEvent(
  c: PoolClient, reservationId: string, status: string,
  actorType: 'customer' | 'pharmacy' | 'system', actorId: string | null, note: string | null = null
) {
  await c.query(
    `INSERT INTO reservation_events (reservation_id, status, actor_type, actor_id, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [reservationId, status, actorType, actorId, note]
  );
}

// Give the units back. Deliberately does NOT touch updated_at: a hold is not a stock update.
export async function releaseHold(c: PoolClient, inventoryId: string, qty: number) {
  await c.query('UPDATE inventory SET qty_reserved = qty_reserved - $2 WHERE id = $1', [inventoryId, qty]);
}

// ---------- Create ----------
interface CreateInput { inventoryId: string; qty: number }

async function createOnce(c: PoolClient, customerId: string, input: CreateInput, code: string) {
  // 1) Lock this customer: their requests are handled one at a time
  const { rows: [cust] } = await c.query(
    'SELECT is_active, suspended_until FROM customers WHERE id = $1 FOR UPDATE', [customerId]);
  if (!cust?.is_active) throw new HttpError(401, 'UNAUTHENTICATED');
  if (cust.suspended_until && new Date(cust.suspended_until) > new Date()) {
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', { until: cust.suspended_until });
  }

  // 2) Already reserved this item? Return the existing reservation (also makes retries safe)
  const { rows: [dup] } = await c.query(
    `SELECT id FROM reservations
      WHERE customer_id = $1 AND inventory_id = $2 AND status IN ('requested','confirmed')`,
    [customerId, input.inventoryId]);
  if (dup) throw new HttpError(409, 'ALREADY_RESERVED', { reservationId: dup.id });

  // 3) Active limit
  const { rows: [{ n }] } = await c.query(
    `SELECT count(*)::int AS n FROM reservations
      WHERE customer_id = $1 AND status IN ('requested','confirmed')`, [customerId]);
  if (n >= R.maxActivePerCustomer) {
    throw new HttpError(409, 'TOO_MANY_ACTIVE_RESERVATIONS', { max: R.maxActivePerCustomer });
  }

  // 4) Lock the stock row. Everyone else asking for this item waits here.
  const { rows: [inv] } = await c.query(
    `SELECT i.id, i.pharmacy_id, i.medicine_id, i.qty_on_hand, i.qty_reserved, i.is_out_of_stock,
            (i.expiry_date > current_date + $2::int)                         AS expiry_ok,
            (i.updated_at > now() - make_interval(days => $3::int))          AS fresh_ok,
            p.status AS pharmacy_status, m.rx_status, m.is_controlled
       FROM inventory i
       JOIN pharmacies p ON p.id = i.pharmacy_id
       JOIN medicines  m ON m.id = i.medicine_id
      WHERE i.id = $1
        FOR UPDATE OF i`,
    [input.inventoryId, S.minDaysBeforeExpiry, S.stockMaxAgeDays]);

  if (!inv || inv.pharmacy_status !== 'verified') throw new HttpError(404, 'ITEM_NOT_FOUND');
  if (inv.is_controlled) {
    throw new HttpError(403, 'NOT_RESERVABLE_ONLINE', {
      hint: 'This medicine cannot be reserved online. Please ask the pharmacy directly.',
    });
  }

  const available = inv.qty_on_hand - inv.qty_reserved;
  // Same rules search uses to hide stock
  if (inv.is_out_of_stock || !inv.expiry_ok || !inv.fresh_ok || available < 1) {
    throw new HttpError(409, 'NOT_AVAILABLE');
  }
  if (input.qty > available) {
    throw new HttpError(409, 'QUANTITY_UNAVAILABLE', { maxReservable: Math.min(available, S.maxReservable) });
  }

  // 5) Hold the units and create the reservation, in the same transaction
  await c.query('UPDATE inventory SET qty_reserved = qty_reserved + $2 WHERE id = $1', [inv.id, input.qty]);

  const { rows: [r] } = await c.query(
    `INSERT INTO reservations
       (code, customer_id, pharmacy_id, inventory_id, medicine_id, qty, requires_prescription, respond_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(mins => $8::int))
     RETURNING id`,
    [code, customerId, inv.pharmacy_id, inv.id, inv.medicine_id, input.qty, inv.rx_status === 'RX', R.respondMinutes]);

  await addEvent(c, r.id, 'requested', 'customer', customerId);

  const { rows: [view] } = await c.query(`${VIEW_SQL} WHERE r.id = $1`, [r.id]);
  return reservationView(view);
}

export async function createReservation(customerId: string, input: CreateInput) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx((c) => createOnce(c, customerId, input, newCode()));
    } catch (e: any) {
      if (e.code === '23505' && e.constraint === 'reservations_code_active') continue; // code collision: new code
      if (e.code === '23505' && e.constraint === 'reservations_one_per_item') throw new HttpError(409, 'ALREADY_RESERVED');
      throw e;
    }
  }
  throw new HttpError(503, 'TRY_AGAIN');
}

// ---------- Read ----------
export async function listMine(customerId: string, scope: 'active' | 'past' | 'all', limit: number, offset: number) {
  const { rows } = await tx((c) => c.query(
    `${VIEW_SQL}
      WHERE r.customer_id = $1
        AND ($2 = 'all'
             OR ($2 = 'active' AND r.status IN ('requested','confirmed'))
             OR ($2 = 'past'   AND r.status NOT IN ('requested','confirmed')))
      ORDER BY r.created_at DESC LIMIT $3 OFFSET $4`,
    [customerId, scope, limit, offset]));
  return rows.map(reservationView);
}

export async function getMine(customerId: string, id: string) {
  return tx(async (c) => {
    const { rows: [r] } = await c.query(`${VIEW_SQL} WHERE r.id = $1 AND r.customer_id = $2`, [id, customerId]);
    if (!r) throw new HttpError(404, 'RESERVATION_NOT_FOUND');
    const { rows: timeline } = await c.query(
      `SELECT status, actor_type, note, created_at
         FROM reservation_events WHERE reservation_id = $1 ORDER BY id`, [id]);
    return { ...reservationView(r), timeline };
  });
}

// ---------- Cancel ----------
export async function cancelMine(customerId: string, id: string) {
  return tx(async (c) => {
    const { rows: [r] } = await c.query(
      `SELECT id, inventory_id, qty, status FROM reservations
        WHERE id = $1 AND customer_id = $2 FOR UPDATE`, [id, customerId]);
    if (!r) throw new HttpError(404, 'RESERVATION_NOT_FOUND');
    if (r.status !== 'requested' && r.status !== 'confirmed') {
      throw new HttpError(409, 'NOT_CANCELLABLE', { status: r.status });
    }

    await releaseHold(c, r.inventory_id, r.qty);
    await c.query(
      `UPDATE reservations SET status = 'cancelled', closed_at = now(), closed_reason = 'customer_cancelled'
        WHERE id = $1`, [id]);
    await addEvent(c, id, 'cancelled', 'customer', customerId);

    const { rows: [view] } = await c.query(`${VIEW_SQL} WHERE r.id = $1`, [id]);
    return reservationView(view);
  });
}

// Used when a customer deletes their account: give every held unit back
export async function cancelAllActiveForCustomer(c: PoolClient, customerId: string, reason = 'account_deleted') {
  const { rows } = await c.query(
    `SELECT id, inventory_id, qty FROM reservations
      WHERE customer_id = $1 AND status IN ('requested','confirmed')
      ORDER BY inventory_id, id
        FOR UPDATE`, [customerId]);
  for (const r of rows) {
    await releaseHold(c, r.inventory_id, r.qty);
    await c.query(
      `UPDATE reservations SET status = 'cancelled', closed_at = now(), closed_reason = $2 WHERE id = $1`,
      [r.id, reason]);
    await addEvent(c, r.id, 'cancelled', 'customer', customerId, 'account deleted');
  }
  return rows.length;
}