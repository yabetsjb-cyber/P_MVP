
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { HttpError } from '../lib/errors';
import { parse } from '../lib/validate';
import { authenticate, requireRole, requirePharmacy } from '../plugins/auth';
import { createPreview, commitImport } from '../services/imports';
import '@fastify/multipart';


const IdParams = z.object({ id: z.string().uuid() });
const UploadQuery = z.object({ mode: z.enum(['update', 'sync']).default('update') });
const RowsQuery = z.object({
  status: z.enum(['ok', 'error', 'unmatched']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const CommitBody = z
  .object({
    acceptSkipped: z.boolean().optional(),
    confirmOutOfStockCount: z.number().int().min(0).optional(),
  })
  .strict();

export async function importRoutes(app: FastifyInstance) {
  const member = [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff'), requirePharmacy];

  // --- Download the template ---
  app.get('/v1/pharmacy/imports/template.csv', { preHandler: member }, async (_req, reply) => {
    const csv =
      '\uFEFFBrand Name,Generic Name,Strength,Pack Size,Quantity in Stock,Expiry Date,Rx/OTC\r\n' +
      'Amoxil,Amoxicillin,500mg,16 caps,20,2027-12-31,RX\r\n';
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="stock-template.csv"')
      .send(csv);
  });

  // --- Upload a file and get a preview (nothing is applied yet) ---
  app.post(
    '/v1/pharmacy/imports',
    { preHandler: member, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { mode } = parse(UploadQuery, req.query);
      if (!req.isMultipart()) throw new HttpError(415, 'EXPECTED_MULTIPART');

      const part = await req.file();
      if (!part) throw new HttpError(400, 'NO_FILE');

      let buf: Buffer;
      try {
        buf = await part.toBuffer();
      } catch (e: any) {
        if (e.code === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, 'FILE_TOO_LARGE', { maxMb: 5 });
        throw e;
      }
      if (part.file.truncated) throw new HttpError(413, 'FILE_TOO_LARGE', { maxMb: 5 });

      const filename = part.filename.replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'upload';
      const preview = await createPreview(req.user!.pharmacyId!, req.user!.id, filename, buf, mode);
      return reply.code(201).send(preview);
    }
  );

  // --- Page through the rows of a preview (e.g. only the errors) ---
  app.get('/v1/pharmacy/imports/:id/rows', { preHandler: member }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const q = parse(RowsQuery, req.query);
    const { rows } = await pool.query(
      `SELECT r.row_number, r.status, r.raw, r.errors, r.warnings, r.medicine_id,
              r.quantity, r.expiry_date, r.suggestions
         FROM import_rows r JOIN imports i ON i.id = r.import_id
        WHERE r.import_id = $1 AND i.pharmacy_id = $2 AND ($3::text IS NULL OR r.status = $3)
        ORDER BY r.row_number LIMIT $4 OFFSET $5`,
      [id, req.user!.pharmacyId, q.status ?? null, q.limit, q.offset]
    );
    return { rows };
  });

  // --- Apply the previewed import ---
  app.post('/v1/pharmacy/imports/:id/commit', { preHandler: member }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const body = parse(CommitBody, req.body ?? {});
    const summary = await commitImport(req.user!.pharmacyId!, req.user!.id, id, body);
    return { committed: true, summary };
  });

  // --- History ---
  app.get('/v1/pharmacy/imports', { preHandler: member }, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, filename, mode, status, total_rows, ok_rows, error_rows, unmatched_rows,
              summary, created_at, committed_at
         FROM imports WHERE pharmacy_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user!.pharmacyId]
    );
    return { imports: rows };
  });
}