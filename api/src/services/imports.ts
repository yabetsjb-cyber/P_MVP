import { createHash } from 'node:crypto';
import { tx } from '../lib/tx';
import { HttpError } from '../lib/errors';
import { parseSheet } from '../lib/spreadsheet';
import { validateRow, type RowIssue } from '../lib/importRow';
import { matchKey } from '../lib/normalize';
import { audit } from '../lib/audit';
import { touchPharmacy } from './inventory';

export type ImportMode = 'update' | 'sync';

interface RowRecord {
  row_number: number;
  status: 'ok' | 'error' | 'unmatched';
  raw: Record<string, unknown>;
  errors: RowIssue[];
  warnings: RowIssue[];
  medicine_id: string | null;
  quantity: number | null;
  expiry_date: string | null;
  suggestions: unknown[] | null;
}

const displayRaw = (cells: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v]));

// ---------- PREVIEW ----------
export async function createPreview(
  pharmacyId: string, userId: string, filename: string, buf: Buffer, mode: ImportMode
) {
  const sheet = await parseSheet(buf);

  // 1) Validate every row (no database needed yet)
  const validated = sheet.rows.map((r) => ({ r, v: validateRow(r.cells) }));
  const keyByRow = new Map<number, string>();
  const identityByRow = new Map<number, { brand_name: string; generic_name: string }>();
  for (const { r, v } of validated) {
    if (v.identity) {
      keyByRow.set(r.rowNumber, matchKey(v.identity));
      identityByRow.set(r.rowNumber, v.identity);
    }
  }
  const keys = [...new Set(keyByRow.values())];

  return tx(async (c) => {
    // 2) Find catalog matches for ALL rows in one query
       const { rows: meds } = keys.length
      ? await c.query(
          `SELECT id, match_key, rx_status, 1 AS pri FROM medicines WHERE match_key = ANY($1::text[])
           UNION ALL
           SELECT m.id, a.match_key, m.rx_status, 0 AS pri
             FROM medicine_aliases a JOIN medicines m ON m.id = a.medicine_id
            WHERE a.match_key = ANY($1::text[])`,
          [keys])
      : { rows: [] as any[] };
    // Aliases are added first and real catalog keys last, so a real key always wins
    const byKey = new Map<string, any>(
      [...meds].sort((a: any, b: any) => a.pri - b.pri).map((m: any) => [m.match_key, m])
    );
    // 3) Build one record per row
    const records: RowRecord[] = [];
    const firstRowForMedicine = new Map<string, number>();
    let mergedRows = 0;
    for (const { r, v } of validated) {
      const key = keyByRow.get(r.rowNumber);
      const med = key ? byKey.get(key) : undefined;
      const rec: RowRecord = {
        row_number: r.rowNumber,
        status: 'ok',
        raw: displayRaw(r.cells),
        errors: v.errors,
        warnings: [...v.warnings],
        medicine_id: med?.id ?? null,
        quantity: v.data?.quantity ?? null,
        expiry_date: v.data?.expiry_date ?? null,
        suggestions: null,
      };
      if (v.errors.length) rec.status = 'error';
      else if (!med) rec.status = 'unmatched';
      else {
        if (v.data!.rx_status && v.data!.rx_status !== med.rx_status) {
          rec.warnings.push({ field: 'rx_status', message: `Catalog says ${med.rx_status}. The catalog value is used.` });
        }
        const first = firstRowForMedicine.get(med.id);
        if (first !== undefined) {
          mergedRows++;
          rec.warnings.push({ field: 'brand_name', message: `Same product as row ${first}: quantities are added and the earliest expiry is kept` });
        } else {
          firstRowForMedicine.set(med.id, r.rowNumber);
        }
      }
      records.push(rec);
    }

    // 4) Suggestions for unmatched rows (first 100), in a single query
    const unmatched = records.filter((x) => x.status === 'unmatched').slice(0, 100);
    if (unmatched.length) {
      await c.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.4');
      const { rows: sug } = await c.query(
        `SELECT u.n AS row_number, s.id, s.brand_name, s.generic_name, s.strength, s.pack_size
           FROM unnest($1::int[], $2::text[]) AS u(n, q)
          CROSS JOIN LATERAL (
            SELECT m.id, m.brand_name, m.generic_name, m.strength, m.pack_size
              FROM medicines m
             WHERE u.q <% (m.brand_name || ' ' || m.generic_name)
             ORDER BY word_similarity(u.q, m.brand_name || ' ' || m.generic_name) DESC, m.brand_name
             LIMIT 3) s`,
        [
          unmatched.map((x) => x.row_number),
          unmatched.map((x) => { const i = identityByRow.get(x.row_number)!; return `${i.brand_name} ${i.generic_name}`; }),
        ]
      );
      for (const x of unmatched) {
        x.suggestions = sug.filter((s: any) => s.row_number === x.row_number).map(({ row_number, ...rest }: any) => rest);
      }
    }

    // 5) Totals
    const okRows = records.filter((x) => x.status === 'ok');
    const errorRows = records.filter((x) => x.status === 'error').length;
    const unmatchedRows = records.filter((x) => x.status === 'unmatched').length;
    const okMedicines = [...new Set(okRows.map((x) => x.medicine_id!))];
    const skipped = errorRows + unmatchedRows;

    let toZero = 0;
    if (mode === 'sync') {
      const { rows: [z] } = await c.query(
        `SELECT count(*)::int AS n FROM inventory
          WHERE pharmacy_id = $1 AND NOT is_out_of_stock AND medicine_id <> ALL($2::uuid[])`,
        [pharmacyId, okMedicines]
      );
      toZero = z.n;
    }

    // 6) Save the preview
    const { rows: [imp] } = await c.query(
      `INSERT INTO imports (pharmacy_id, uploaded_by, filename, file_sha256, mode, total_rows, ok_rows,
                            error_rows, unmatched_rows, products_to_update, products_to_zero, ignored_columns)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, created_at`,
      [pharmacyId, userId, filename, createHash('sha256').update(buf).digest('hex'), mode,
       records.length, okRows.length, errorRows, unmatchedRows, okMedicines.length, toZero, sheet.ignoredColumns]
    );
    await c.query(
      `INSERT INTO import_rows (import_id, row_number, status, raw, errors, warnings, medicine_id, quantity, expiry_date, suggestions)
       SELECT $1, r.row_number, r.status, r.raw, r.errors, r.warnings, r.medicine_id, r.quantity, r.expiry_date, r.suggestions
         FROM jsonb_to_recordset($2::jsonb) AS r(
           row_number int, status text, raw jsonb, errors jsonb, warnings jsonb,
           medicine_id uuid, quantity int, expiry_date date, suggestions jsonb)`,
      [imp.id, JSON.stringify(records)]
    );

    return {
      import: {
        id: imp.id, filename, mode,
        totalRows: records.length, okRows: okRows.length, errorRows, unmatchedRows,
        productsToUpdate: okMedicines.length, mergedRows,
        willMarkOutOfStock: mode === 'sync' ? toZero : null,
        ignoredColumns: sheet.ignoredColumns,
        expiresInHours: 24,
      },
      canCommit: okRows.length > 0 && !(mode === 'sync' && skipped > 0),
      requiresAcceptSkipped: mode === 'update' && skipped > 0,
      syncBlockedReason: mode === 'sync' && skipped > 0
        ? 'Fix every error and unmatched row first. Otherwise a sync would mark those products out of stock.'
        : null,
      problems: records.filter((x) => x.status !== 'ok').slice(0, 50),
      problemsShown: Math.min(skipped, 50),
      sample: okRows.slice(0, 5),
    };
  });
}

// ---------- COMMIT ----------
export async function commitImport(
  pharmacyId: string, userId: string, importId: string,
  opts: { acceptSkipped?: boolean; confirmOutOfStockCount?: number }
) {
  return tx(async (c) => {
    const { rows: [imp] } = await c.query(
      'SELECT * FROM imports WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE', [importId, pharmacyId]);
    if (!imp) throw new HttpError(404, 'IMPORT_NOT_FOUND');
    if (imp.status === 'committed') throw new HttpError(409, 'ALREADY_COMMITTED');
    if (Date.now() - new Date(imp.created_at).getTime() > 24 * 3600 * 1000) {
      throw new HttpError(409, 'PREVIEW_EXPIRED', { hint: 'Upload the file again to get a fresh preview.' });
    }
    if (imp.ok_rows === 0) throw new HttpError(400, 'NOTHING_TO_COMMIT');

    const skipped = imp.error_rows + imp.unmatched_rows;
    if (imp.mode === 'sync' && skipped > 0) {
      throw new HttpError(409, 'SYNC_REQUIRES_CLEAN_FILE', { skipped });
    }
    if (skipped > 0 && !opts.acceptSkipped) {
      throw new HttpError(409, 'SKIPPED_ROWS_NOT_ACCEPTED', {
        skipped, hint: 'Send {"acceptSkipped": true} to import the valid rows and skip the rest.',
      });
    }

    const notInFile = `NOT EXISTS (SELECT 1 FROM import_rows r
                                    WHERE r.import_id = $2 AND r.status = 'ok' AND r.medicine_id = inventory.medicine_id)`;

    if (imp.mode === 'sync') {
      const { rows: [z] } = await c.query(
        `SELECT count(*)::int AS n FROM inventory WHERE pharmacy_id = $1 AND NOT is_out_of_stock AND ${notInFile}`,
        [pharmacyId, importId]);
      if (opts.confirmOutOfStockCount !== z.n) {
        throw new HttpError(409, 'CONFIRM_OUT_OF_STOCK_COUNT', {
          willMarkOutOfStock: z.n,
          hint: 'Resend with confirmOutOfStockCount set to this number.',
        });
      }
    }

    // Aggregate rows per product (sum quantities, earliest expiry), then upsert
    const up = await c.query(
      `WITH agg AS (
         SELECT medicine_id, SUM(quantity)::int AS qty, MIN(expiry_date) AS expiry
           FROM import_rows WHERE import_id = $1 AND status = 'ok' GROUP BY medicine_id)
       INSERT INTO inventory (pharmacy_id, medicine_id, qty_on_hand, expiry_date, is_out_of_stock)
       SELECT $2::uuid, medicine_id, qty, expiry, qty = 0 FROM agg ORDER BY medicine_id
       ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET
         qty_on_hand     = GREATEST(EXCLUDED.qty_on_hand, inventory.qty_reserved),
         expiry_date     = EXCLUDED.expiry_date,
         is_out_of_stock = (EXCLUDED.qty_on_hand = 0),
         updated_at      = now()
       RETURNING (xmax = 0) AS inserted`,
      [importId, pharmacyId]
    );
    const created = up.rows.filter((r) => r.inserted).length;
    const updated = up.rows.length - created;

    let zeroed = 0;
    if (imp.mode === 'sync') {
      const z = await c.query(
        `UPDATE inventory SET is_out_of_stock = true, qty_on_hand = qty_reserved, updated_at = now()
          WHERE pharmacy_id = $1 AND NOT is_out_of_stock AND ${notInFile}`,
        [pharmacyId, importId]);
      zeroed = z.rowCount ?? 0;
    }

    const summary = { created, updated, markedOutOfStock: zeroed, skippedRows: skipped };
    await c.query(
      `UPDATE imports SET status = 'committed', committed_at = now(), summary = $2 WHERE id = $1`,
      [importId, JSON.stringify(summary)]);
    await touchPharmacy(c, pharmacyId);
    await audit(c, userId, 'inventory.import_committed', 'pharmacy', pharmacyId, { importId, mode: imp.mode, ...summary });
    return summary;
  });
}