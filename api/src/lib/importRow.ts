import type { MedicineIdentity } from './normalize';

export interface RowIssue { field: string; message: string }
export interface RowData { quantity: number; expiry_date: string; rx_status: 'RX' | 'OTC' | null }
export interface RowResult {
  identity: MedicineIdentity | null;  // present when the 4 product-name fields are usable (needed for matching)
  data: RowData | null;               // present only when the whole row is valid
  errors: RowIssue[];
  warnings: RowIssue[];
}

const pad = (n: number) => String(n).padStart(2, '0');

function makeIso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // rejects 31/02
  return `${y}-${pad(m)}-${pad(d)}`;
}
const lastDayIso = (y: number, m: number) =>
  m < 1 || m > 12 ? null : makeIso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());

export function parseExpiry(v: unknown): { iso: string } | { error: string } {
  const bad = 'Not a valid date. Use YYYY-MM-DD, DD/MM/YYYY or MM/YYYY (Gregorian, as printed on the pack)';
  if (v instanceof Date) return isNaN(+v) ? { error: bad } : { iso: v.toISOString().slice(0, 10) };
  if (typeof v === 'number') {                                   // Excel serial date
    if (v < 20000 || v > 80000) return { error: bad };
    return { iso: new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10) };
  }
  const s = String(v ?? '').trim();
  let m: RegExpMatchArray | null;
  let iso: string | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) iso = makeIso(+m[1], +m[2], +m[3]);
  else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) iso = makeIso(+m[3], +m[2], +m[1]); // day first
  else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{4})$/))) iso = lastDayIso(+m[2], +m[1]);                    // MM/YYYY
  else if ((m = s.match(/^(\d{4})[\/.\-](\d{1,2})$/))) iso = lastDayIso(+m[1], +m[2]);                    // YYYY-MM
  else return { error: bad };
  return iso ? { iso } : { error: 'Not a real calendar date' };
}

export function validateRow(cells: Record<string, unknown>, now = new Date()): RowResult {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });

  const text = (field: string, max = 120) => {
    const v = cells[field];
    const s = v === null || v === undefined || v instanceof Date ? '' : String(v).trim();
    if (!s) err(field, 'Required');
    else if (s.length > max) err(field, `Too long (max ${max} characters)`);
    return s;
  };
  const brand_name = text('brand_name');
  const generic_name = text('generic_name');
  const strength = text('strength', 60);
  const pack_size = text('pack_size', 60);
  const identity = errors.length === 0 ? { brand_name, generic_name, strength, pack_size } : null;

  // Quantity: whole number, 0 or more. An empty cell is an error, never silently 0.
  let quantity = 0;
  const q = cells.quantity;
  if (q === null || q === undefined || String(q).trim() === '') {
    err('quantity', 'Required');
  } else {
    const s = typeof q === 'number' ? String(q) : String(q).trim().replace(/[,\s]/g, '');
    if (!/^\d+(\.0+)?$/.test(s)) err('quantity', 'Must be a whole number, 0 or more');
    else if (Number(s) > 100_000) err('quantity', 'Unrealistically large (max 100000)');
    else quantity = Number(s);
  }

  // Expiry
  const todayIso = now.toISOString().slice(0, 10);
  const soonIso = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  let expiry = '';
  const e = parseExpiry(cells.expiry_date);
  if ('error' in e) err('expiry_date', e.error);
  else if (e.iso <= todayIso) err('expiry_date', 'Already expired. Dates must be Gregorian, as printed on the pack (not the Ethiopian calendar).');
  else if (+e.iso.slice(0, 4) > now.getUTCFullYear() + 10) err('expiry_date', 'More than 10 years away. Please check the year.');
  else {
    expiry = e.iso;
    if (e.iso <= soonIso) warnings.push({ field: 'expiry_date', message: 'Expires within 60 days: hidden from customer search' });
  }

  // Rx/OTC is optional in the file; the catalog's value is the truth
  let rx: 'RX' | 'OTC' | null = null;
  const rawRx = cells.rx_status === null || cells.rx_status === undefined ? '' : String(cells.rx_status).trim().toUpperCase();
  if (rawRx === 'RX' || rawRx === 'OTC') rx = rawRx;
  else if (rawRx) err('rx_status', 'Must be RX or OTC');

  return {
    identity,
    data: errors.length ? null : { quantity, expiry_date: expiry, rx_status: rx },
    errors,
    warnings,
  };
}