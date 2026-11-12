/**
 * Minimal CSV helpers for the import wizard. Not a general-purpose library —
 * intentionally narrow: escape by wrapping in double quotes, double any
 * internal quotes. That is enough for "download the error rows so the
 * pharmacist can fix them in Excel".
 */

export function rowsToCsv(
  rows: Array<{
    row_number: number;
    status: string;
    raw: Record<string, unknown>;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
    quantity: number | null;
    expiry_date: string | null;
  }>,
): string {
  const header = 'row_number,status,brand_name,strength,quantity,expiry_date,issues';

  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const lines = rows.map((r) => {
    const raw = r.raw ?? {};
    const issues = [...r.errors, ...r.warnings]
      .map((e) => e.message)
      .join('; ');
    return [
      r.row_number,
      r.status,
      raw.brand_name ?? '',
      raw.strength ?? '',
      r.quantity ?? raw.quantity ?? '',
      r.expiry_date ?? raw.expiry_date ?? '',
      issues,
    ]
      .map(escape)
      .join(',');
  });

  return [header, ...lines].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}