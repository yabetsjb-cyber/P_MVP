import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { tx } from '../lib/tx';
import { HttpError } from '../lib/errors';
import { parse, priceEtb, quantity, gregorianFutureDate } from '../lib/validate';
import { authenticate, requireRole, requirePharmacy } from '../plugins/auth';
import { applyPatch, markOutOfStock, touchPharmacy } from '../services/inventory';

const IdParams = z.object({ id: z.string().uuid() });

const stockFields = {
  priceEtb: priceEtb.optional(),
  quantity: quantity.optional(),                                  // set exact count
  addQuantity: z.number().int().min(1).max(100_000).optional(),   // refill
  expiryDate: gregorianFutureDate.optional(),
};
const exclusive = (o: { quantity?: number; addQuantity?: number }) =>
  !(o.quantity !== undefined && o.addQuantity !== undefined);

const PatchBody = z
  .object(stockFields)
  .strict()
  .refine(exclusive, 'Send either quantity or addQuantity, not both')
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to update');

const AddBody = z
  .object({
    medicineId: z.string().uuid(),
    priceEtb,
    quantity,
    expiryDate: gregorianFutureDate,
  })
  .strict();

const BulkItem = z
  .object({ id: z.string().uuid(), ...stockFields, outOfStock: z.literal(true).optional() })
  .strict()
  .refine(exclusive, 'Send either quantity or addQuantity, not both')
  .refine((i) => !(i.outOfStock && (i.quantity !== undefined || i.addQuantity !== undefined)),
          'Send either outOfStock or a quantity change, not both')
  .refine((i) => i.outOfStock || i.priceEtb !== undefined || i.quantity !== undefined ||
                 i.addQuantity !== undefined || i.expiryDate !== undefined, 'Nothing to update');

const BulkBody = z
  .object({
    items: z
      .array(BulkItem)
      .min(1)
      .max(100)
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'Duplicate item ids'),
  })
  .strict();

const ListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  filter: z.enum(['all', 'out_of_stock', 'expiring', 'stale']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const CatalogQuery = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

export async function inventoryRoutes(app: FastifyInstance) {
  const member = [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff'), requirePharmacy];

  // --- Find a product in the master catalog (typo tolerant) ---
  app.get('/v1/pharmacy/catalog', { preHandler: member }, async (req) => {
    const q = parse(CatalogQuery, req.query);
    const medicines = await tx(async (c) => {
      await c.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.3');
      const { rows } = await c.query(
        `SELECT m.id, m.brand_name, m.generic_name, m.strength, m.dosage_form, m.pack_size,
                m.rx_status, m.is_controlled,
                i.id AS inventory_id,     -- not null = already in my inventory
                word_similarity($1, m.brand_name || ' ' || m.generic_name) AS score
           FROM medicines m
           LEFT JOIN inventory i ON i.medicine_id = m.id AND i.pharmacy_id = $2
          WHERE $1 <% (m.brand_name || ' ' || m.generic_name)
          ORDER BY score DESC, m.brand_name
          LIMIT $3`,
        [q.q, req.user!.pharmacyId, q.limit]
      );
      return rows;
    });
    return { medicines };
  });

  // --- Add a product to my inventory ---
  app.post('/v1/pharmacy/inventory', { preHandler: member }, async (req, reply) => {
    const b = parse(AddBody, req.body);
    const pid = req.user!.pharmacyId!;

    const item = await tx(async (c) => {
      const { rowCount } = await c.query('SELECT 1 FROM medicines WHERE id = $1', [b.medicineId]);
      if (!rowCount) throw new HttpError(404, 'MEDICINE_NOT_FOUND');

      const { rows: [row] } = await c.query(
        `INSERT INTO inventory (pharmacy_id, medicine_id, price_etb, qty_on_hand, expiry_date, is_out_of_stock)
         VALUES ($1, $2, $3, $4, $5, $4::int = 0)
         ON CONFLICT (pharmacy_id, medicine_id) DO NOTHING
         RETURNING id, medicine_id, price_etb, qty_on_hand, qty_reserved,
                   (qty_on_hand - qty_reserved) AS available, expiry_date, is_out_of_stock, updated_at`,
        [pid, b.medicineId, b.priceEtb, b.quantity, b.expiryDate]
      );
      if (!row) {
        const { rows: [existing] } = await c.query(
          'SELECT id FROM inventory WHERE pharmacy_id = $1 AND medicine_id = $2', [pid, b.medicineId]);
        throw new HttpError(409, 'ALREADY_IN_INVENTORY', { inventoryId: existing.id });
      }
      await touchPharmacy(c, pid);
      return row;
    });
    return reply.code(201).send({ item });
  });

  // --- List my inventory ---
  app.get('/v1/pharmacy/inventory', { preHandler: member }, async (req) => {
    const q = parse(ListQuery, req.query);
    // Escape LIKE wildcards so a search for "50%" is literal
    const pattern = q.q ? `%${q.q.replace(/[\\%_]/g, '\\$&')}%` : null;

    const { rows } = await pool.query(
      `SELECT i.id, i.medicine_id, m.brand_name, m.generic_name, m.strength, m.pack_size, m.rx_status,
              i.price_etb, i.qty_on_hand, i.qty_reserved,
              (i.qty_on_hand - i.qty_reserved) AS available,
              i.expiry_date, i.is_out_of_stock, i.updated_at,
              (i.expiry_date <= current_date + 60) AS expiring_soon,
              count(*) OVER() AS total
         FROM inventory i
         JOIN medicines m ON m.id = i.medicine_id
        WHERE i.pharmacy_id = $1
          AND ($2::text IS NULL OR (m.brand_name || ' ' || m.generic_name) ILIKE $2)
          AND (   $3 = 'all'
               OR ($3 = 'out_of_stock' AND (i.is_out_of_stock OR i.qty_on_hand - i.qty_reserved <= 0))
               OR ($3 = 'expiring'     AND i.expiry_date <= current_date + 60)
               OR ($3 = 'stale'        AND i.updated_at < now() - interval '7 days'))
        ORDER BY m.brand_name, m.strength
        LIMIT $4 OFFSET $5`,
      [req.user!.pharmacyId, pattern, q.filter, q.limit, q.offset]
    );
    return { total: rows[0] ? Number(rows[0].total) : 0, items: rows.map(({ total, ...r }) => r) };
  });

  // --- Edit price / quantity / expiry, or refill ---
  app.patch('/v1/pharmacy/inventory/:id', { preHandler: member }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const body = parse(PatchBody, req.body);
    const pid = req.user!.pharmacyId!;
    const item = await tx(async (c) => {
      const row = await applyPatch(c, pid, id, body);
      await touchPharmacy(c, pid);
      return row;
    });
    return { item };
  });

  // --- Mark out of stock ---
  app.put('/v1/pharmacy/inventory/:id/out-of-stock', { preHandler: member }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const pid = req.user!.pharmacyId!;
    const item = await tx(async (c) => {
      const row = await markOutOfStock(c, pid, id);
      await touchPharmacy(c, pid);
      return row;
    });
    return { item, activeReservedUnits: item.qty_reserved };
  });

  // --- Quick update: many items in one all-or-nothing request ---
  app.post('/v1/pharmacy/inventory/bulk-update', { preHandler: member }, async (req) => {
    const { items } = parse(BulkBody, req.body);
    const pid = req.user!.pharmacyId!;

    const updated = await tx(async (c) => {
      const result = new Map<string, unknown>();
      // Sorted order: two simultaneous bulk updates can't deadlock each other
      for (const it of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
        const { id, outOfStock, ...patch } = it;
        if (Object.values(patch).some((v) => v !== undefined)) {
          result.set(id, await applyPatch(c, pid, id, patch));
        }
        if (outOfStock) result.set(id, await markOutOfStock(c, pid, id));
      }
      await touchPharmacy(c, pid);
      return [...result.values()];
    });
    return { updated: updated.length, items: updated };
  });
}