import type { PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { matchKey } from '../lib/normalize';
import { audit } from '../lib/audit';

export const MAX_PENDING_PER_PHARMACY = 100;
export const MAX_BULK_ROWS = 100;

// ---------- Input schemas ----------
const text = (max: number) => z.string().trim().min(1).max(max);
const dosageForm = z.string().trim().min(1).max(40);

export const RequestBody = z
  .object({
    brandName: text(120), genericName: text(120), strength: text(60), packSize: text(60),
    dosageForm: dosageForm.optional(),
    rxStatus: z.enum(['RX', 'OTC']).optional(),   // only a hint: the admin decides
  })
  .strict();

export const FromImportBody = z
  .object({ rowNumbers: z.array(z.number().int().min(2)).min(1).max(MAX_BULK_ROWS).optional() })
  .strict();

export const ApproveBody = z
  .object({
    // Any identity field left out keeps the pharmacy's value
    brandName: text(120).optional(), genericName: text(120).optional(),
    strength: text(60).optional(), packSize: text(60).optional(),
    dosageForm: dosageForm.optional(),
    rxStatus: z.enum(['RX', 'OTC']),               // required: the admin must decide
    isControlled: z.boolean().default(false),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((b) => !(b.isControlled && b.rxStatus === 'OTC'),
          { message: 'Controlled medicines must be RX', path: ['rxStatus'] });

export const MergeBody = z
  .object({ medicineId: z.string().uuid(), note: z.string().trim().max(500).optional() })
  .strict();

export const RejectBody = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

// ---------- Helpers ----------
interface Identity { brandName: string; genericName: string; strength: string; packSize: string }

function keyOf(i: Identity): string {
  const key = matchKey({
    brand_name: i.brandName, generic_name: i.genericName, strength: i.strength, pack_size: i.packSize,
  });
  const parts = key.split('|');
  if (parts.length !== 4 || parts.some((p) => !p)) {
    throw new HttpError(400, 'INVALID_PRODUCT_DETAILS', {
      hint: 'Each of brand, generic, strength and pack size needs real letters or digits.',
    });
  }
  return key;
}

// Is this spelling already a catalog medicine (directly or through an alias)?
export async function findExistingMedicine(c: PoolClient, key: string): Promise<string | null> {
  const { rows } = await c.query(
    `SELECT id FROM medicines WHERE match_key = $1
     UNION ALL
     SELECT medicine_id FROM medicine_aliases WHERE match_key = $1
     LIMIT 1`,
    [key]
  );
  return rows[0]?.id ?? null;
}

// Also serializes one pharmacy's requests so the pending cap can't be raced.
async function requireVerifiedPharmacy(c: PoolClient, pharmacyId: string) {
  const { rows: [p] } = await c.query('SELECT status FROM pharmacies WHERE id = $1 FOR UPDATE', [pharmacyId]);
  if (!p || p.status !== 'verified') throw new HttpError(403, 'PHARMACY_NOT_VERIFIED');
}

// ---------- Pharmacy side ----------
export type CreateOutcome =
  | { outcome: 'created'; requestId: string }
  | { outcome: 'already_requested'; requestId: string }
  | { outcome: 'already_in_catalog'; medicineId: string }
  | { outcome: 'previously_rejected'; requestId: string; reason: string | null }
  | { outcome: 'limit_reached' };

async function createRequest(
  c: PoolClient,
  a: {
    pharmacyId: string; userId: string; identity: Identity;
    dosageForm?: string | null; rx?: 'RX' | 'OTC' | null;
    importId?: string | null; row?: number | null;
  }
): Promise<CreateOutcome> {
  const key = keyOf(a.identity);

  const existing = await findExistingMedicine(c, key);
  if (existing) return { outcome: 'already_in_catalog', medicineId: existing };

  const { rows: [dup] } = await c.query(
    `SELECT id FROM catalog_requests WHERE pharmacy_id = $1 AND match_key = $2 AND status = 'pending'`,
    [a.pharmacyId, key]);
  if (dup) return { outcome: 'already_requested', requestId: dup.id };

  const { rows: [rej] } = await c.query(
    `SELECT id, admin_note FROM catalog_requests
      WHERE pharmacy_id = $1 AND match_key = $2 AND status = 'rejected'
        AND reviewed_at > now() - interval '30 days'
      ORDER BY reviewed_at DESC LIMIT 1`,
    [a.pharmacyId, key]);
  if (rej) return { outcome: 'previously_rejected', requestId: rej.id, reason: rej.admin_note };

  const { rows: [{ n }] } = await c.query(
    `SELECT count(*)::int AS n FROM catalog_requests WHERE pharmacy_id = $1 AND status = 'pending'`,
    [a.pharmacyId]);
  if (n >= MAX_PENDING_PER_PHARMACY) return { outcome: 'limit_reached' };

  // The pharmacy row is locked, so no race can create a duplicate between the check and here
  const { rows: [row] } = await c.query(
    `INSERT INTO catalog_requests
       (pharmacy_id, requested_by, brand_name, generic_name, strength, dosage_form, pack_size,
        suggested_rx_status, match_key, source_import_id, source_row)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [a.pharmacyId, a.userId, a.identity.brandName, a.identity.genericName, a.identity.strength,
     a.dosageForm ?? null, a.identity.packSize, a.rx ?? null, key, a.importId ?? null, a.row ?? null]);
  return { outcome: 'created', requestId: row.id };
}

export async function requestSingle(
  c: PoolClient, pharmacyId: string, userId: string, b: z.infer<typeof RequestBody>
) {
  await requireVerifiedPharmacy(c, pharmacyId);
  const out = await createRequest(c, {
    pharmacyId, userId,
    identity: { brandName: b.brandName, genericName: b.genericName, strength: b.strength, packSize: b.packSize },
    dosageForm: b.dosageForm ?? null, rx: b.rxStatus ?? null,
  });
  if (out.outcome === 'created') {
    await audit(c, userId, 'catalog_request.created', 'catalog_request', out.requestId, { brand: b.brandName });
  }
  return out;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

// Turn the unmatched rows of an import preview into requests
export async function requestFromImport(
  c: PoolClient, pharmacyId: string, userId: string, importId: string, rowNumbers?: number[]
) {
  await requireVerifiedPharmacy(c, pharmacyId);

  const { rowCount } = await c.query('SELECT 1 FROM imports WHERE id = $1 AND pharmacy_id = $2', [importId, pharmacyId]);
  if (!rowCount) throw new HttpError(404, 'IMPORT_NOT_FOUND');

  const { rows } = await c.query(
    `SELECT row_number, raw FROM import_rows
      WHERE import_id = $1 AND status = 'unmatched'
        AND ($2::int[] IS NULL OR row_number = ANY($2::int[]))
      ORDER BY row_number LIMIT $3`,
    [importId, rowNumbers ?? null, MAX_BULK_ROWS]);
  if (!rows.length) throw new HttpError(400, 'NO_UNMATCHED_ROWS');

  const results: Array<{ row: number; outcome: string; [k: string]: unknown }> = [];
  for (const r of rows) {
    const raw = r.raw as Record<string, unknown>;
    const rx = str(raw.rx_status).toUpperCase();
    try {
      const out = await createRequest(c, {
        pharmacyId, userId,
        identity: { brandName: str(raw.brand_name), genericName: str(raw.generic_name),
                    strength: str(raw.strength), packSize: str(raw.pack_size) },
        rx: rx === 'RX' || rx === 'OTC' ? rx : null,
        importId, row: r.row_number,
      });
      results.push({ row: r.row_number, ...out });
    } catch (e) {
      if (e instanceof HttpError) results.push({ row: r.row_number, outcome: 'invalid', error: e.code });
      else throw e;
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  await audit(c, userId, 'catalog_request.created_from_import', 'pharmacy', pharmacyId, { importId, ...summary });
  return { summary, results };
}

// ---------- Admin side ----------

// Locks this request AND every identical pending request, always in id order (no deadlocks)
async function lockGroup(c: PoolClient, id: string) {
  const { rows: [probe] } = await c.query('SELECT match_key, status FROM catalog_requests WHERE id = $1', [id]);
  if (!probe) throw new HttpError(404, 'REQUEST_NOT_FOUND');
  const { rows } = await c.query(
    `SELECT * FROM catalog_requests WHERE match_key = $1 AND status = 'pending' ORDER BY id FOR UPDATE`,
    [probe.match_key]);
  const req = rows.find((r) => r.id === id);
  if (!req) throw new HttpError(409, 'ALREADY_REVIEWED', { status: probe.status });
  return req;
}

async function resolveGroup(
  c: PoolClient, adminId: string, matchKeyValue: string,
  status: 'approved' | 'merged', medicineId: string, note: string | null
) {
  const res = await c.query(
    `UPDATE catalog_requests
        SET status = $2, medicine_id = $3, admin_note = $4, reviewed_by = $5, reviewed_at = now()
      WHERE match_key = $1 AND status = 'pending'`,
    [matchKeyValue, status, medicineId, note, adminId]);
  return res.rowCount ?? 0;
}

async function saveAlias(c: PoolClient, key: string, medicineId: string, requestId: string) {
  await c.query(
    `INSERT INTO medicine_aliases (match_key, medicine_id, created_from_request)
     VALUES ($1, $2, $3) ON CONFLICT (match_key) DO NOTHING`,
    [key, medicineId, requestId]);
}

export async function approveRequest(
  c: PoolClient, adminId: string, id: string, b: z.infer<typeof ApproveBody>
) {
  const req = await lockGroup(c, id);
  const identity: Identity = {
    brandName: b.brandName ?? req.brand_name,
    genericName: b.genericName ?? req.generic_name,
    strength: b.strength ?? req.strength,
    packSize: b.packSize ?? req.pack_size,
  };
  const key = keyOf(identity);

  // Neither the final spelling nor the original may already be in the catalog
  for (const k of new Set([key, req.match_key])) {
    const existing = await findExistingMedicine(c, k);
    if (existing) {
      throw new HttpError(409, 'ALREADY_IN_CATALOG', {
        medicineId: existing,
        hint: 'Merge this request into the existing medicine instead of creating a duplicate.',
      });
    }
  }

  let medicineId: string;
  try {
    const res = await c.query(
      `INSERT INTO medicines (brand_name, generic_name, strength, dosage_form, pack_size, rx_status, is_controlled, match_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [identity.brandName, identity.genericName, identity.strength, b.dosageForm ?? req.dosage_form,
       identity.packSize, b.rxStatus, b.isControlled, key]);
    medicineId = res.rows[0].id;
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'ALREADY_IN_CATALOG');
    throw e;
  }

  if (key !== req.match_key) await saveAlias(c, req.match_key, medicineId, req.id); // keep the pharmacy's spelling working
  const resolved = await resolveGroup(c, adminId, req.match_key, 'approved', medicineId, b.note ?? null);
  await audit(c, adminId, 'catalog_request.approved', 'catalog_request', id,
              { medicineId, resolved, edited: key !== req.match_key, isControlled: b.isControlled, rxStatus: b.rxStatus });
  return { medicineId, resolvedRequests: resolved };
}

export async function mergeRequest(
  c: PoolClient, adminId: string, id: string, b: z.infer<typeof MergeBody>
) {
  const req = await lockGroup(c, id);
  const { rows: [med] } = await c.query('SELECT id FROM medicines WHERE id = $1', [b.medicineId]);
  if (!med) throw new HttpError(404, 'MEDICINE_NOT_FOUND');

  const existing = await findExistingMedicine(c, req.match_key);
  if (existing && existing !== med.id) {
    throw new HttpError(409, 'ORIGINAL_ALREADY_IN_CATALOG', {
      medicineId: existing, hint: 'This spelling already belongs to another medicine. Merge into that one.',
    });
  }
  if (!existing) await saveAlias(c, req.match_key, med.id, req.id);

  const resolved = await resolveGroup(c, adminId, req.match_key, 'merged', med.id, b.note ?? null);
  await audit(c, adminId, 'catalog_request.merged', 'catalog_request', id, { medicineId: med.id, resolved });
  return { medicineId: med.id, resolvedRequests: resolved };
}

export async function rejectRequest(c: PoolClient, adminId: string, id: string, reason: string) {
  const req = await lockGroup(c, id);
  const res = await c.query(
    `UPDATE catalog_requests
        SET status = 'rejected', admin_note = $2, reviewed_by = $3, reviewed_at = now()
      WHERE match_key = $1 AND status = 'pending'`,
    [req.match_key, reason, adminId]);
  await audit(c, adminId, 'catalog_request.rejected', 'catalog_request', id, { reason, resolved: res.rowCount });
  return { resolvedRequests: res.rowCount ?? 0 };
}