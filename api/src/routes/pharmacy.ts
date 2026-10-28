import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool } from '../db';
import { config } from '../config';
import { authenticate, requireRole, requirePharmacy } from '../plugins/auth';
import { parseBody, requiredEthiopianPhone } from '../lib/validate';
import { sniffFileType } from '../lib/files';
import { audit } from '../lib/audit';
import '@fastify/multipart';

const DOC_TYPES = ['pharmacy_license', 'trade_license', 'pharmacist_license'];

const RegisterPharmacyBody = z.object({
  name: z.string().trim().min(2).max(120),
  licenseNo: z.string().trim().min(3).max(60),
  licenseExpiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD (Gregorian)')
    .refine((d) => !isNaN(Date.parse(d)), 'Invalid date')
    .refine((d) => Date.parse(d) > Date.now(), 'Licence already expired'),
  phone: requiredEthiopianPhone,
  address: z.string().trim().max(250).optional(),
  subcity: z.string().trim().max(80).optional(),
  // Bounding box of Ethiopia: catches swapped lat/lng, the classic mistake
  lat: z.number().min(3.4).max(14.9),
  lng: z.number().min(33).max(48),
});

export async function pharmacyRoutes(app: FastifyInstance) {
  const owner = [authenticate, requireRole('pharmacy_owner')];
  const member = [authenticate, requireRole('pharmacy_owner', 'pharmacy_staff'), requirePharmacy];

  // --- Register my pharmacy (creates it as 'pending') ---
  app.post('/v1/pharmacy/register', { preHandler: owner }, async (req, reply) => {
    const body = parseBody(RegisterPharmacyBody, req.body, reply);
    if (!body) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock my user row so two simultaneous requests can't create two pharmacies
      const { rows: [u] } = await client.query(
        'SELECT pharmacy_id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
      if (u.pharmacy_id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'ALREADY_HAS_PHARMACY' });
      }

      const { rows: [p] } = await client.query(
        `INSERT INTO pharmacies
           (name, license_no, license_expires_on, phone, address, subcity, location)
         VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326)::geography)
         RETURNING id, name, license_no, status`,
        [body.name, body.licenseNo, body.licenseExpiresOn, body.phone,
         body.address ?? null, body.subcity ?? null, body.lng, body.lat]);

      await client.query('UPDATE users SET pharmacy_id = $1 WHERE id = $2', [p.id, req.user!.id]);
      await audit(client, req.user!.id, 'pharmacy.registered', 'pharmacy', p.id, { licenseNo: p.license_no });
      await client.query('COMMIT');
      return reply.code(201).send({ pharmacy: p });
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return reply.code(409).send({ error: 'LICENSE_ALREADY_REGISTERED' });
      throw e;
    } finally {
      client.release();
    }
  });

  // --- My pharmacy and its documents ---
  app.get('/v1/pharmacy/me', { preHandler: member }, async (req) => {
    const pid = req.user!.pharmacyId;
    const { rows: [pharmacy] } = await pool.query(
      `SELECT id, name, license_no, license_expires_on, status, status_reason, phone,
              address, subcity, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, created_at
         FROM pharmacies WHERE id = $1`, [pid]);
    const { rows: documents } = await pool.query(
      `SELECT id, doc_type, original_name, mime, size_bytes, uploaded_at
         FROM pharmacy_documents WHERE pharmacy_id = $1 ORDER BY uploaded_at DESC`, [pid]);
    return { pharmacy, documents };
  });

  // --- Upload a licence document. The type is in the URL so it can't arrive after the file. ---
  app.post('/v1/pharmacy/documents/:docType',
    { preHandler: [authenticate, requireRole('pharmacy_owner'), requirePharmacy] },
    async (req, reply) => {
      const { docType } = req.params as { docType: string };
      if (!DOC_TYPES.includes(docType)) return reply.code(400).send({ error: 'INVALID_DOC_TYPE', allowed: DOC_TYPES });
      if (!req.isMultipart()) return reply.code(415).send({ error: 'EXPECTED_MULTIPART' });

      const pid = req.user!.pharmacyId!;
      const { rows: [{ n }] } = await pool.query(
        'SELECT count(*)::int AS n FROM pharmacy_documents WHERE pharmacy_id = $1', [pid]);
      if (n >= 10) return reply.code(409).send({ error: 'TOO_MANY_DOCUMENTS' });

      const part = await req.file();
      if (!part) return reply.code(400).send({ error: 'NO_FILE' });

      let buf: Buffer;
      try {
        buf = await part.toBuffer();
      } catch (e: any) {
        if (e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'FILE_TOO_LARGE', maxMb: 5 });
        throw e;
      }
      if (part.file.truncated) return reply.code(413).send({ error: 'FILE_TOO_LARGE', maxMb: 5 });

      const kind = sniffFileType(buf);
      if (!kind) return reply.code(400).send({ error: 'INVALID_FILE_TYPE', allowed: ['pdf', 'jpg', 'png'] });

      const storedName = `${randomUUID()}${kind.ext}`;   // we choose the name, never the uploader
      await fs.mkdir(config.documentsDir, { recursive: true });
      await fs.writeFile(path.join(config.documentsDir, storedName), buf, { flag: 'wx' });

      try {
        const originalName = part.filename.replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'unnamed';
        const { rows: [doc] } = await pool.query(
          `INSERT INTO pharmacy_documents
             (pharmacy_id, doc_type, original_name, stored_name, mime, size_bytes, sha256, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, doc_type, original_name, mime, size_bytes, uploaded_at`,
          [pid, docType, originalName, storedName, kind.mime, buf.length,
           createHash('sha256').update(buf).digest('hex'), req.user!.id]);
        await audit(pool, req.user!.id, 'pharmacy.document_uploaded', 'pharmacy', pid, { docType, docId: doc.id });
        return reply.code(201).send({ document: doc });
      } catch (e) {
        await fs.unlink(path.join(config.documentsDir, storedName)).catch(() => {}); // no orphan files
        throw e;
      }
    });

  // --- After a rejection and fixing the problem, send it back for review ---
  app.post('/v1/pharmacy/resubmit', { preHandler: [authenticate, requireRole('pharmacy_owner'), requirePharmacy] },
    async (req, reply) => {
      const { rowCount } = await pool.query(
        `UPDATE pharmacies SET status = 'pending', status_reason = NULL
          WHERE id = $1 AND status = 'rejected'`, [req.user!.pharmacyId]);
      if (!rowCount) return reply.code(409).send({ error: 'NOT_REJECTED' });
      await audit(pool, req.user!.id, 'pharmacy.resubmitted', 'pharmacy', req.user!.pharmacyId);
      return { ok: true };
    });
}
