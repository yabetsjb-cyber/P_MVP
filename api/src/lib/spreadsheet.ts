import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { HttpError } from './errors';

export const MAX_ROWS = 5000;

// Accepted header names (compared lowercase, underscores/extra spaces ignored)
const HEADER_ALIASES: Record<string, string> = {
  'brand name': 'brand_name', brand: 'brand_name',
  'generic name': 'generic_name', generic: 'generic_name',
  strength: 'strength', dosage: 'strength',
  'pack size': 'pack_size', pack: 'pack_size',
  'quantity in stock': 'quantity', quantity: 'quantity', qty: 'quantity', stock: 'quantity',
  'expiry date': 'expiry_date', 'expire date': 'expiry_date', 'expiration date': 'expiry_date',
  expiry: 'expiry_date', 'exp date': 'expiry_date',
  'rx/otc': 'rx_status', 'rx (otc status)': 'rx_status', rx: 'rx_status', 'rx status': 'rx_status',
};
const REQUIRED = ['brand_name', 'generic_name', 'strength', 'pack_size', 'quantity', 'expiry_date'];

const norm = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');

export interface ParsedSheet {
  rows: { rowNumber: number; cells: Record<string, unknown> }[];
  ignoredColumns: string[];
}

function detectKind(buf: Buffer): 'xlsx' | 'csv' {
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'xlsx'; // ZIP container
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
    throw new HttpError(400, 'XLS_NOT_SUPPORTED', { hint: 'Old .xls files are not supported. Save as .xlsx or CSV.' });
  }
  if (buf.subarray(0, 2000).includes(0)) {
    throw new HttpError(400, 'UNSUPPORTED_FILE', { hint: 'Upload a .xlsx file or a CSV saved as "CSV UTF-8".' });
  }
  return 'csv';
}

// Excel cells can hold formulas, rich text, hyperlinks: flatten all of them to plain values
function cellValue(v: any): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

async function readXlsx(buf: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch {
    throw new HttpError(400, 'UNREADABLE_FILE');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new HttpError(400, 'EMPTY_FILE');
  if (ws.rowCount > 50_000 || ws.columnCount > 60) throw new HttpError(400, 'SHEET_TOO_LARGE');

  const grid: unknown[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: unknown[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellValue(row.getCell(c).value));
    grid.push(cells);
  }
  return grid;
}

function readCsv(buf: Buffer): unknown[][] {
  const text = buf.toString('utf8').replace(/^\uFEFF/, ''); // strip Excel's byte-order mark
  // header:false keeps row numbers identical to what the user sees in their file
  return Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
}

export async function parseSheet(buf: Buffer): Promise<ParsedSheet> {
  const grid = detectKind(buf) === 'xlsx' ? await readXlsx(buf) : readCsv(buf);
  const headerCells = grid[0] ?? [];

  const colMap = headerCells.map((h) => HEADER_ALIASES[norm(h)] ?? null);
  const ignoredColumns = headerCells
    .map((h, i) => (colMap[i] === null && norm(h) ? String(h).trim() : null))
    .filter((x): x is string => !!x);

  const seen = new Set<string>();
  for (const f of colMap) {
    if (!f) continue;
    if (seen.has(f)) throw new HttpError(400, 'DUPLICATE_COLUMN', { column: f });
    seen.add(f);
  }
  const missing = REQUIRED.filter((f) => !seen.has(f));
  if (missing.length) {
    throw new HttpError(400, 'MISSING_COLUMNS', {
      missing,
      found: headerCells.map((h) => String(h ?? '').trim()).filter(Boolean),
      hint: 'Put the column names in row 1. Download the template to see them.',
    });
  }

  const rows: ParsedSheet['rows'] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells: Record<string, unknown> = {};
    let hasData = false;
    colMap.forEach((field, c) => {
      if (!field) return;
      const v = grid[i][c];
      if (v !== null && v !== undefined && String(v).trim() !== '') hasData = true;
      cells[field] = v ?? null;
    });
    if (!hasData) continue;                                  // skip blank rows
    rows.push({ rowNumber: i + 1, cells });                  // row 1 = header, so first data row = 2
    if (rows.length > MAX_ROWS) throw new HttpError(400, 'TOO_MANY_ROWS', { max: MAX_ROWS });
  }
  if (!rows.length) throw new HttpError(400, 'EMPTY_FILE');
  return { rows, ignoredColumns };
}