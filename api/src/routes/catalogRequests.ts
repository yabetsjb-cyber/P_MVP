import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { tx } from '../lib/tx';
import { HttpError } from '../lib/errors';
import { parse } from '../lib/validate';
import { authenticate, requireRole, requirePharmacy } from '../plugins/auth';
import {
  RequestBody, FromImportBody, ApproveBody, MergeBody, RejectBody,
  requestSingle, requestFromImport, approveRequest, mergeRequest, rejectRequest,
  MAX_PENDING_PER_PHARMACY,
} from '../services/catalogRequests';

const IdParams = z.object({ id: z.string().uuid() });
const StatusQuery = z.object({
  status: z.enum(['pending', 'approved', 'merged', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const SearchQuery = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function catalogRequestRoutes(app: FastifyInstance) {
  const member = [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff'), requirePharmacy];
  const admin = [authenticate, requireRole('platform_admin')];

  // ================= Pharmacy =================

  // --- Request one product directly ---
  app.post(
    '/v1/pharmacy/catalog-requests',
    { preHandler: member, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const b = parse(RequestBody, req.body);
      const out = await tx((c) => requestSingle(c, req.user!.pharmacyId!, req.user!.id, b));

      if (out.outcome === 'previously_rejected') {
        throw new HttpError(409, 'REQUEST_PREVIOUSLY_REJECTED', { reason: out.reason });
      }
      if (out.outcome === 'limit_reached') {
        throw new HttpError(429, 'TOO_MANY_PENDING_REQUESTS', { max: MAX_PENDING_PER_PHARMACY });
      }
      return reply.code(out.outcome === 'created' ? 201 : 200).send(out);
    }
  );

  // --- Request every unmatched row of an import preview (or only chosen rows) ---
  app.post(
    '/v1/pharmacy/imports/:id/request-catalog-entries',
    { preHandler: member, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req) => {
      const { id } = parse(IdParams, req.params);
      const b = parse(FromImportBody, req.body ?? {});
      return tx((c) => requestFromImport(c, req.user!.pharmacyId!, req.user!.id, id, b.rowNumbers));
    }
  );

  // --- My requests and their outcomes ---
  app.get('/v1/pharmacy/catalog-requests', { preHandler: member }, async (req) => {
    const q = parse(StatusQuery, req.query);
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.brand_name, r.generic_name, r.strength, r.dosage_form, r.pack_size,
              r.admin_note, r.created_at, r.reviewed_at, r.medicine_id,
              m.brand_name AS medicine_brand, m.generic_name AS medicine_generic,
              m.strength AS medicine_strength, m.pack_size AS medicine_pack_size
         FROM catalog_requests r
         LEFT JOIN medicines m ON m.id = r.medicine_id
        WHERE r.pharmacy_id = $1 AND ($2::text IS NULL OR r.status = $2)
        ORDER BY r.created_at DESC LIMIT $3 OFFSET $4`,
      [req.user!.pharmacyId, q.status ?? null, q.limit, q.offset]
    );
    return { requests: rows };
  });

  // ================= Admin =================

  // --- The review queue (oldest first) with similar catalog entries and duplicate counts ---
  app.get('/v1/admin/catalog-requests', { preHandler: admin }, async (req) => {
    const q = parse(StatusQuery, req.query);
    const status = q.status ?? 'pending';
    const requests = await tx(async (c) => {
      await c.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.4');
      const { rows } = await c.query(
        `SELECT r.id, r.status, r.brand_name, r.generic_name, r.strength, r.dosage_form, r.pack_size,
                r.suggested_rx_status, r.admin_note, r.medicine_id, r.created_at,
                p.id AS pharmacy_id, p.name AS pharmacy_name, p.license_no,
                (SELECT count(*) FROM catalog_requests o
                  WHERE o.match_key = r.match_key AND o.status = 'pending' AND o.id <> r.id)::int AS also_requested_by,
                sug.suggestions
           FROM catalog_requests r
           JOIN pharmacies p ON p.id = r.pharmacy_id
           LEFT JOIN LATERAL (
             SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) AS suggestions
               FROM (SELECT m.id, m.brand_name, m.generic_name, m.strength, m.pack_size, m.rx_status
                       FROM medicines m
                      WHERE (r.brand_name || ' ' || r.generic_name) <% (m.brand_name || ' ' || m.generic_name)
                      ORDER BY word_similarity(r.brand_name || ' ' || r.generic_name,
                                               m.brand_name || ' ' || m.generic_name) DESC
                      LIMIT 3) s
           ) sug ON true
          WHERE r.status = $1
          ORDER BY r.created_at ASC LIMIT $2 OFFSET $3`,
        [status, q.limit, q.offset]
      );
      return rows;
    });
    return { requests };
  });

  // --- Search the catalog (to pick a merge target) ---
  app.get('/v1/admin/medicines', { preHandler: admin }, async (req) => {
    const q = parse(SearchQuery, req.query);
    const medicines = await tx(async (c) => {
      await c.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.3');
      const { rows } = await c.query(
        `SELECT id, brand_name, generic_name, strength, dosage_form, pack_size, rx_status, is_controlled
           FROM medicines
          WHERE $1 <% (brand_name || ' ' || generic_name)
          ORDER BY word_similarity($1, brand_name || ' ' || generic_name) DESC, brand_name
          LIMIT $2`,
        [q.q, q.limit]);
      return rows;
    });
    return { medicines };
  });

  // --- Approve: create the medicine (admin may edit any detail) ---
  app.post('/v1/admin/catalog-requests/:id/approve', { preHandler: admin }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const b = parse(ApproveBody, req.body);
    return tx((c) => approveRequest(c, req.user!.id, id, b));
  });

  // --- Merge: it's an existing medicine under another spelling ---
  app.post('/v1/admin/catalog-requests/:id/merge', { preHandler: admin }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const b = parse(MergeBody, req.body);
    return tx((c) => mergeRequest(c, req.user!.id, id, b));
  });

  // --- Reject (the reason is shown to the pharmacy) ---
  app.post('/v1/admin/catalog-requests/:id/reject', { preHandler: admin }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const b = parse(RejectBody, req.body);
    return tx((c) => rejectRequest(c, req.user!.id, id, b.reason));
  });
}