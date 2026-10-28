import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db';
import { config } from '../config';
import { tx } from '../lib/tx';
import { HttpError } from '../lib/errors';
import { parseQuery, strengthMatches } from '../lib/query';

const S = config.search;

export interface Spot { lat: number; lng: number; radiusM: number }

// ---------- Formatting ----------
const freshness = (updatedAt: Date): 'fresh' | 'recent' | 'stale' => {
  const hours = (Date.now() - updatedAt.getTime()) / 3_600_000;
  return hours < 24 ? 'fresh' : hours < 24 * 7 ? 'recent' : 'stale';
};

const medicineView = (m: any) => ({
  id: m.id,
  brandName: m.brand_name,
  genericName: m.generic_name,
  strength: m.strength,
  dosageForm: m.dosage_form,
  packSize: m.pack_size,
  rxStatus: m.rx_status,
  requiresPrescription: m.rx_status === 'RX',
});

const pharmacyView = (r: any) => {
  const available = Number(r.available);
  return {
    pharmacyId: r.pharmacy_id,
    inventoryId: r.inventory_id,                       // used to reserve
    name: r.name,
    address: r.address,
    subcity: r.subcity,
    phone: r.phone,
    openingHours: r.opening_hours,
    lat: r.lat,
    lng: r.lng,
    distanceMeters: Math.round(Number(r.meters) / 10) * 10,
    stockLevel: available <= S.lowStockAt ? 'low' : 'ok',
    maxReservable: Math.min(available, S.maxReservable),
    updatedAt: r.updated_at,
    freshness: freshness(new Date(r.updated_at)),
  };
};

// ---------- Nearby stock for a list of medicines ----------
async function findStock(c: PoolClient, medicineIds: string[], spot: Spot, perMedicine: number) {
  if (!medicineIds.length) return [];
  const { rows } = await c.query(
    `WITH pt AS (SELECT ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography AS g)
     SELECT * FROM (
       SELECT i.medicine_id, i.id AS inventory_id, i.updated_at,
              (i.qty_on_hand - i.qty_reserved) AS available,
              p.id AS pharmacy_id, p.name, p.address, p.subcity, p.phone, p.opening_hours,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
              ST_Distance(p.location, pt.g) AS meters,
              row_number() OVER (PARTITION BY i.medicine_id ORDER BY ST_Distance(p.location, pt.g)) AS rn,
              count(*)     OVER (PARTITION BY i.medicine_id) AS total_nearby
         FROM pt
         JOIN pharmacies p ON p.status = 'verified' AND ST_DWithin(p.location, pt.g, $4)
         JOIN inventory  i ON i.pharmacy_id = p.id
                          AND i.medicine_id = ANY($1::uuid[])
                          AND NOT i.is_out_of_stock
                          AND i.qty_on_hand - i.qty_reserved > 0
                          AND i.expiry_date > current_date + $5::int
                          AND i.updated_at > now() - make_interval(days => $6::int)
     ) x
     WHERE rn <= $7
     ORDER BY medicine_id, meters`,
    [medicineIds, spot.lng, spot.lat, spot.radiusM, S.minDaysBeforeExpiry, S.stockMaxAgeDays, perMedicine]
  );
  return rows;
}

// ---------- Search ----------
export async function searchMedicines(rawQuery: string, spot: Spot) {
  const parsed = parseQuery(rawQuery);
  if (parsed.text.length < 2) throw new HttpError(400, 'QUERY_TOO_SHORT');

  return tx(async (c) => {
    await c.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.3');

    // 1) Candidates by name (typo tolerant), regardless of stock or location
    const { rows: cands } = await c.query(
      `SELECT id, brand_name, generic_name, strength, dosage_form, pack_size, rx_status, is_controlled,
              word_similarity($1, brand_name || ' ' || generic_name) AS score
         FROM medicines
        WHERE $1 <% (brand_name || ' ' || generic_name)
        ORDER BY score DESC, brand_name
        LIMIT 30`,
      [parsed.text]
    );

    // 2) Boost the ones whose strength matches what was typed
    const ranked = cands
      .map((m) => ({ ...m, rank: Number(m.score) + (strengthMatches(m.strength, parsed.strength) ? 0.25 : 0) }))
      .sort((a, b) => b.rank - a.rank || a.brand_name.localeCompare(b.brand_name))
      .slice(0, S.maxMedicines);

    const top = ranked[0] ?? null;
    const confident = !!top && Number(top.score) >= S.confidentMatch;
    const restricted = confident && !!top.is_controlled;

    // 3) Controlled medicines never get a pharmacy list
    const open = ranked.filter((m) => !m.is_controlled);
    const stock = await findStock(c, open.map((m) => m.id), spot, S.perMedicinePharmacies);

    const byMedicine = new Map<string, any[]>();
    for (const r of stock) {
      const list = byMedicine.get(r.medicine_id) ?? [];
      list.push(r);
      byMedicine.set(r.medicine_id, list);
    }

    const medicines: Array<ReturnType<typeof medicineView> & { pharmacies: ReturnType<typeof pharmacyView>[]; moreNearby: number }> = [];
    const unavailable: ReturnType<typeof medicineView>[] = [];
    for (const m of open) {
      const rows = byMedicine.get(m.id);
      if (rows?.length) {
        medicines.push({
          ...medicineView(m),
          pharmacies: rows.map(pharmacyView),
          moreNearby: Math.max(0, Number(rows[0].total_nearby) - rows.length),
        });
      } else {
        unavailable.push(medicineView(m));
      }
    }

    return {
      parsed,
      restricted,
      matchedMedicineId: confident ? (top.id as string) : null,  // "known medicine" for analytics
      medicines,
      unavailable: unavailable.slice(0, 5),
    };
  });
}

// ---------- One medicine and every pharmacy near the customer that has it ----------
export async function medicineAvailability(medicineId: string, spot: Spot) {
  return tx(async (c) => {
    const { rows: [m] } = await c.query(
      `SELECT id, brand_name, generic_name, strength, dosage_form, pack_size, rx_status
         FROM medicines WHERE id = $1 AND NOT is_controlled`,
      [medicineId]
    );
    if (!m) throw new HttpError(404, 'NOT_FOUND');
    const rows = await findStock(c, [m.id], spot, 50);
    return {
      medicine: medicineView(m),
      pharmacies: rows.map(pharmacyView),
      moreNearby: rows.length ? Math.max(0, Number(rows[0].total_nearby) - rows.length) : 0,
    };
  });
}

// ---------- Anonymous search log ----------
// Same person, same day -> same hash (lets us count distinct searchers).
// Different day -> different hash. Cannot be reversed without the server secret.
export function sessionHash(ip: string, userAgent: string | undefined): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHmac('sha256', config.analyticsSecret)
    .update(`${day}|${ip}|${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

export function logSearch(e: {
  normalizedQuery: string; matchedMedicineId: string | null; resultsCount: number;
  restricted: boolean; radiusM: number; lat: number; lng: number; sessionHash: string;
}) {
  // Deliberately not awaited by the caller: analytics must never slow or break a search
  pool
    .query(
      `INSERT INTO search_events
         (normalized_query, matched_medicine_id, results_count, restricted, radius_m, geo_cell, session_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.normalizedQuery, e.matchedMedicineId, e.resultsCount, e.restricted, e.radiusM,
       `${e.lat.toFixed(2)},${e.lng.toFixed(2)}`, e.sessionHash]
    )
    .catch((err) => console.warn('search_events insert failed:', err.message));
}