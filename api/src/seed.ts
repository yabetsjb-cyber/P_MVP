import { pool } from './db';
import { matchKey } from './lib/normalize';
// this is for testing purpose seed represents bulk data
// Small deterministic random generator: same seed -> same data every run
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

// brand, generic, strength, form, pack, rx, controlled, base price (ETB)
const MEDICINES: [string, string, string, string, string, 'RX' | 'OTC', boolean, number][] = [
  ['Amoxil', 'Amoxicillin', '500mg', 'capsule', '16 caps', 'RX', false, 420],
  ['Augmentin', 'Amoxicillin/Clavulanate', '625mg', 'tablet', '14 tabs', 'RX', false, 780],
  ['Panadol', 'Paracetamol', '500mg', 'tablet', '24 tabs', 'OTC', false, 110],
  ['Brufen', 'Ibuprofen', '400mg', 'tablet', '30 tabs', 'OTC', false, 150],
  ['Voltaren', 'Diclofenac', '50mg', 'tablet', '20 tabs', 'RX', false, 260],
  ['Glucophage', 'Metformin', '500mg', 'tablet', '60 tabs', 'RX', false, 340],
  ['Norvasc', 'Amlodipine', '5mg', 'tablet', '30 tabs', 'RX', false, 380],
  ['Tenormin', 'Atenolol', '50mg', 'tablet', '28 tabs', 'RX', false, 300],
  ['Losec', 'Omeprazole', '20mg', 'capsule', '14 caps', 'RX', false, 290],
  ['Cipro', 'Ciprofloxacin', '500mg', 'tablet', '10 tabs', 'RX', false, 350],
  ['Zithromax', 'Azithromycin', '500mg', 'tablet', '3 tabs', 'RX', false, 520],
  ['Flagyl', 'Metronidazole', '500mg', 'tablet', '20 tabs', 'RX', false, 180],
  ['Septrin', 'Cotrimoxazole', '480mg', 'tablet', '20 tabs', 'RX', false, 120],
  ['Zyrtec', 'Cetirizine', '10mg', 'tablet', '10 tabs', 'OTC', false, 130],
  ['Claritin', 'Loratadine', '10mg', 'tablet', '10 tabs', 'OTC', false, 140],
  ['Ventolin', 'Salbutamol', '100mcg', 'inhaler', '200 doses', 'RX', false, 450],
  ['Coartem', 'Artemether/Lumefantrine', '20mg/120mg', 'tablet', '24 tabs', 'RX', false, 400],
  ['Zentel', 'Albendazole', '400mg', 'tablet', '1 tab', 'OTC', false, 90],
  ['ORS', 'Oral Rehydration Salts', '20.5g', 'sachet', '10 sachets', 'OTC', false, 80],
  ['Vitamin C', 'Ascorbic Acid', '500mg', 'tablet', '30 tabs', 'OTC', false, 100],
  ['Valium', 'Diazepam', '5mg', 'tablet', '30 tabs', 'RX', true, 200], // controlled: test for the future block
];

// name, license, phone, lng, lat (approximate, test only)
const PHARMACIES: [string, string, string, number, number][] = [
  ['Test Pharmacy Bole', 'LIC-001', '0911000001', 38.7893, 8.9962],
  ['Test Pharmacy Piassa', 'LIC-002', '0911000002', 38.7469, 9.0359],
  ['Test Pharmacy Kazanchis', 'LIC-003', '0911000003', 38.7682, 9.0153],
  ['Test Pharmacy Sarbet', 'LIC-004', '0911000004', 38.7380, 8.9930],
  ['Test Pharmacy Megenagna', 'LIC-005', '0911000005', 38.8010, 9.0200],
  ['Test Pharmacy CMC', 'LIC-006', '0911000006', 38.8280, 9.0070],
];

async function main() {
  // 1) Pharmacies (safe to run repeatedly)
  for (const [name, lic, phone, lng, lat] of PHARMACIES) {
    await pool.query(
      `INSERT INTO pharmacies (name, license_no, phone, status, location)
       VALUES ($1, $2, $3, 'verified', ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
       ON CONFLICT (license_no) DO NOTHING`,
      [name, lic, phone, lng, lat]
    );
  }

  // 2) Medicines
  const medIds: { id: string; base: number }[] = [];
  for (const [brand, generic, strength, form, pack, rx, controlled, base] of MEDICINES) {
    const key = matchKey({ brand_name: brand, generic_name: generic, strength, pack_size: pack });
    const { rows } = await pool.query(
      `INSERT INTO medicines (brand_name, generic_name, strength, dosage_form, pack_size, rx_status, is_controlled, match_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (match_key) DO UPDATE SET rx_status = EXCLUDED.rx_status
       RETURNING id`,
      [brand, generic, strength, form, pack, rx, controlled, key]
    );
    medIds.push({ id: rows[0].id, base });
  }

  // 3) Inventory: each pharmacy stocks roughly 70% of the catalog
  const { rows: pharmacies } = await pool.query(`SELECT id FROM pharmacies WHERE license_no LIKE 'LIC-%'`);
  let count = 0;
  for (const p of pharmacies) {
    for (const m of medIds) {
      if (rand() > 0.7) continue;
      const price = Math.round(m.base * (0.85 + rand() * 0.3) * 100) / 100;
      const qty = Math.floor(rand() * 80);                  // 0 to 79 (0 = out of stock)
      const expiryDays = rand() < 0.1 ? 20 : 90 + Math.floor(rand() * 700); // 10% expire soon
      await pool.query(
        `INSERT INTO inventory (pharmacy_id, medicine_id, price_etb, qty_on_hand, expiry_date, is_out_of_stock)
         VALUES ($1,$2,$3,$4, current_date + $5::int, $4::int = 0)
         ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET
           price_etb = EXCLUDED.price_etb, qty_on_hand = EXCLUDED.qty_on_hand,
           expiry_date = EXCLUDED.expiry_date, is_out_of_stock = EXCLUDED.is_out_of_stock, updated_at = now()`,
        [p.id, m.id, price, qty, expiryDays]
      );
      count++;
    }
  }
  console.log(`Seeded ${PHARMACIES.length} pharmacies, ${MEDICINES.length} medicines, ${count} inventory rows`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
