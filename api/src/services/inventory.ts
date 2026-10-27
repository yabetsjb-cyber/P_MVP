import type { PoolClient } from 'pg';
import { HttpError } from '../lib/errors';

export interface StockPatch {
  priceEtb?: number;
  quantity?: number;      // set the exact count
  addQuantity?: number;   // refill: add N to what's on hand
  expiryDate?: string;    // YYYY-MM-DD
}

const RETURNING = `
  RETURNING id, medicine_id, price_etb, qty_on_hand, qty_reserved,
            (qty_on_hand - qty_reserved) AS available,
            expiry_date, is_out_of_stock, updated_at`;

export async function applyPatch(c: PoolClient, pharmacyId: string, id: string, p: StockPatch) {
  // Lock the row. The pharmacy_id condition is the tenant check.
  const { rows: [cur] } = await c.query(
    'SELECT qty_reserved FROM inventory WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE',
    [id, pharmacyId]
  );
  if (!cur) throw new HttpError(404, 'ITEM_NOT_FOUND', { id });

  if (p.quantity !== undefined && p.quantity < cur.qty_reserved) {
    throw new HttpError(409, 'BELOW_RESERVED', {
      id,
      reserved: cur.qty_reserved,
      hint: 'Customers have reserved this stock. Keep quantity at or above the reserved amount, or use out-of-stock.',
    });
  }

  const { rows: [row] } = await c.query(
    `UPDATE inventory SET
       price_etb   = COALESCE($2::numeric, price_etb),
       qty_on_hand = CASE WHEN $3::int IS NOT NULL THEN $3::int
                          WHEN $5::int IS NOT NULL THEN qty_on_hand + $5::int
                          ELSE qty_on_hand END,
       expiry_date = COALESCE($4::date, expiry_date),
       is_out_of_stock = CASE WHEN $3::int IS NOT NULL THEN $3::int = 0
                              WHEN $5::int IS NOT NULL THEN false
                              ELSE is_out_of_stock END,
       updated_at  = now()
     WHERE id = $1 AND pharmacy_id = $6
     ${RETURNING}`,
    [id, p.priceEtb ?? null, p.quantity ?? null, p.expiryDate ?? null, p.addQuantity ?? null, pharmacyId]
  );
  return row;
}

// Hide from search, but keep honouring units customers already reserved.
export async function markOutOfStock(c: PoolClient, pharmacyId: string, id: string) {
  const { rows: [row] } = await c.query(
    `UPDATE inventory
        SET is_out_of_stock = true, qty_on_hand = qty_reserved, updated_at = now()
      WHERE id = $1 AND pharmacy_id = $2
      ${RETURNING}`,
    [id, pharmacyId]
  );
  if (!row) throw new HttpError(404, 'ITEM_NOT_FOUND', { id });
  return row;
}

// Powers the "updated 3h ago" freshness badge.
export async function touchPharmacy(c: PoolClient, pharmacyId: string) {
  await c.query('UPDATE pharmacies SET last_inventory_update = now() WHERE id = $1', [pharmacyId]);
}