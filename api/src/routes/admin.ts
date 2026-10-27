import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { pool } from '../db';
import { config } from '../config';
import { authenticate, requireRole } from '../plugins/auth';
import { parseBody } from '../lib/validate';
import { audit } from '../lib/audit';

const IdParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(),
});
const ReasonBody = z.object({ reason: z.string().trim().min(5).max(500) });

// One place for every status change: atomic, only from allowed states, always audited.
async function changeStatus(
  adminId: string, pharmacyId: string, from: string[],
  to: 'verified' | 'rejected' | 'suspended', reason: string | null
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE pharmacies
          SET status = $3::text,
              status_reason = $4,
              verified_at = CASE WHEN $3::text = 'verified' THEN now() ELSE verified_at END,
              verified_by = CASE WHEN $3::text = 'verified' THEN $5::uuid ELSE verified_by END
        WHERE id = $1 AND status = ANY($2::text[])
        RETURNING id, status`,
      [pharmacyId, from, to, reason, adminId]);
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    await audit(client, adminId, `pharmacy.${to}`, 'pharmacy', pharmacyId, { reason });
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function adminRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireRole('platform_admin')];

  // --- Review queue ---
  app.get('/v1/admin/pharmacies', { preHandler: guard }, async (req, reply) => {
    const q = parseBody(ListQuery, req.query, reply);
    if (!q) return;
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.license_no, p.license_expires_on, p.status, p.phone, p.subcity, p.created_at,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
              (SELECT count(*) FROM pharmacy_documents d WHERE d.pharmacy_id = p.id)::int AS doc_count
         FROM pharmacies p
        WHERE ($1::text IS NULL OR p.status = $1)
        ORDER BY p.created_at DESC LIMIT 100`,
      [q.status ?? null]);
    return { pharmacies: rows };
  });

  // --- One pharmacy: details, owner, documents, history ---
  app.get('/v1/admin/pharmacies/:id', { preHandler: guard }, async (req, reply) => {
    const params = parseBody(IdParams, req.params, reply);
    if (!params) return;
    const { rows: [pharmacy] } = await pool.query(
      `SELECT id, name, license_no, license_expires_on, status, status_reason, phone, address, subcity,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
              verified_at, verified_by, created_at
         FROM pharmacies WHERE id = $1`, [params.id]);
    if (!pharmacy) return reply.code(404).send({ error: 'NOT_FOUND' });
    const { rows: owners } = await pool.query(
      `SELECT id, email, full_name, phone, role FROM users WHERE pharmacy_id = $1`, [params.id]);
    const { rows: documents } = await pool.query(
      `SELECT id, doc_type, original_name, mime, size_bytes, uploaded_at
         FROM pharmacy_documents WHERE pharmacy_id = $1 ORDER BY uploaded_at DESC`, [params.id]);
    const { rows: history } = await pool.query(
      `SELECT action, actor_user_id, details, created_at FROM audit_log
        WHERE entity_type = 'pharmacy' AND entity_id = $1 ORDER BY created_at DESC LIMIT 50`, [params.id]);
    return { pharmacy, owners, documents, history };
  });

  // --- View a document (streamed, never a public URL) ---
  app.get('/v1/admin/documents/:id/file', { preHandler: guard }, async (req, reply) => {
    const params = parseBody(IdParams, req.params, reply);
    if (!params) return;
    const { rows: [d] } = await pool.query(
      'SELECT id, pharmacy_id, doc_type, stored_name, mime FROM pharmacy_documents WHERE id = $1', [params.id]);
    if (!d) return reply.code(404).send({ error: 'NOT_FOUND' });

    await audit(pool, req.user!.id, 'document.viewed', 'pharmacy', d.pharmacy_id, { docId: d.id });
    return reply
      .header('Content-Type', d.mime)
      .header('Content-Disposition', `inline; filename="${d.doc_type}-${d.id}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store')
      .send(createReadStream(path.join(config.documentsDir, path.basename(d.stored_name))));
  });

  // --- Verify (also used to reinstate a suspended pharmacy) ---
  app.post('/v1/admin/pharmacies/:id/verify', { preHandler: guard }, async (req, reply) => {
    const params = parseBody(IdParams, req.params, reply);
    if (!params) return;

    const { rows: [chk] } = await pool.query(
      `SELECT p.license_expires_on,
              EXISTS (SELECT 1 FROM pharmacy_documents d
                       WHERE d.pharmacy_id = p.id AND d.doc_type = 'pharmacy_license') AS has_license_doc
         FROM pharmacies p WHERE p.id = $1`, [params.id]);
    if (!chk) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (!chk.has_license_doc) return reply.code(409).send({ error: 'MISSING_LICENSE_DOCUMENT' });
    if (chk.license_expires_on && new Date(chk.license_expires_on) <= new Date())
      return reply.code(409).send({ error: 'LICENSE_EXPIRED' });

    const done = await changeStatus(req.user!.id, params.id, ['pending', 'suspended'], 'verified', null);
    if (!done) return reply.code(409).send({ error: 'INVALID_STATE' });
    return { pharmacy: done };
  });

  // --- Reject (reason is shown to the owner) ---
  app.post('/v1/admin/pharmacies/:id/reject', { preHandler: guard }, async (req, reply) => {
    const params = parseBody(IdParams, req.params, reply);
    if (!params) return;
    const body = parseBody(ReasonBody, req.body, reply);
    if (!body) return;
    const done = await changeStatus(req.user!.id, params.id, ['pending'], 'rejected', body.reason);
    if (!done) return reply.code(409).send({ error: 'INVALID_STATE' });
    return { pharmacy: done };
  });

  // --- Suspend a verified pharmacy ---
  app.post('/v1/admin/pharmacies/:id/suspend', { preHandler: guard }, async (req, reply) => {
    const params = parseBody(IdParams, req.params, reply);
    if (!params) return;
    const body = parseBody(ReasonBody, req.body, reply);
    if (!body) return;
    const done = await changeStatus(req.user!.id, params.id, ['verified'], 'suspended', body.reason);
    if (!done) return reply.code(409).send({ error: 'INVALID_STATE' });
    return { pharmacy: done };
  });
}
