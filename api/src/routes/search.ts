import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { parse } from '../lib/validate';
import { searchMedicines, medicineAvailability, logSearch, sessionHash } from '../services/search';

const S = config.search;

// The box around Ethiopia. It catches the classic swapped latitude/longitude mistake.
const lat = z.coerce.number().min(3.4, 'Location must be inside Ethiopia').max(14.9, 'Location must be inside Ethiopia');
const lng = z.coerce.number().min(33, 'Location must be inside Ethiopia').max(48, 'Location must be inside Ethiopia');
const radius = z.coerce.number().int().min(500).max(S.maxRadiusM).default(S.defaultRadiusM);

const SearchQuery = z.object({ q: z.string().trim().min(2).max(80), lat, lng, radius_m: radius });
const DetailQuery = z.object({ lat, lng, radius_m: radius });
const IdParams = z.object({ id: z.string().uuid() });

export async function searchRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  // --- Search ---
  app.get('/v1/search', limit, async (req, reply) => {
    const q = parse(SearchQuery, req.query);
    const spot = { lat: q.lat, lng: q.lng, radiusM: q.radius_m };
    const r = await searchMedicines(q.q, spot);

    // Log after we have the answer, without waiting for it
    logSearch({
      normalizedQuery: r.parsed.cleaned.toLowerCase().slice(0, 80),
      matchedMedicineId: r.matchedMedicineId,
      resultsCount: r.medicines.reduce((n, m) => n + m.pharmacies.length, 0),
      restricted: r.restricted,
      radiusM: spot.radiusM,
      lat: q.lat,
      lng: q.lng,
      sessionHash: sessionHash(req.ip, req.headers['user-agent']),
    });

    reply.header('Cache-Control', 'no-store');
    return {
      query: { text: r.parsed.text, strength: r.parsed.strength },
      searchedRadiusMeters: spot.radiusM,
      canWiden: spot.radiusM < S.maxRadiusM,
      notice: r.restricted
        ? { code: 'RESTRICTED_MEDICINE', message: 'This medicine is not listed online. Please ask a pharmacy directly.' }
        : null,
      medicines: r.medicines,
      unavailable: r.unavailable,   // matched by name but nobody nearby has it
    };
  });

  // --- Details of one medicine (the click-through from a result) ---
  app.get('/v1/medicines/:id', limit, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const q = parse(DetailQuery, req.query);
    const r = await medicineAvailability(id, { lat: q.lat, lng: q.lng, radiusM: q.radius_m });
    reply.header('Cache-Control', 'no-store');
    return { ...r, searchedRadiusMeters: q.radius_m, canWiden: q.radius_m < S.maxRadiusM };
  });
}