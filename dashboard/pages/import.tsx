import { useState, FormEvent, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api, errorMessage, ApiError } from '@/lib/api';
import { rowsToCsv, downloadCsv } from '@/lib/csv';

type Step = 1 | 2 | 3;
type Mode = 'update' | 'sync';
type RowFilter = 'all' | 'error' | 'unmatched' | 'ok';

interface ImportRow {
  row_number: number;
  status: 'ok' | 'error' | 'unmatched';
  raw: Record<string, unknown>;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  medicine_id: string | null;
  quantity: number | null;
  expiry_date: string | null;
  suggestions: Array<{
    id: string;
    brand_name: string;
    generic_name: string;
    strength: string;
    pack_size: string;
  }> | null;
}

interface PreviewResponse {
  import: {
    id: string;
    filename: string;
    mode: Mode;
    totalRows: number;
    okRows: number;
    errorRows: number;
    unmatchedRows: number;
    productsToUpdate: number;
    mergedRows: number;
    willMarkOutOfStock: number | null;
    ignoredColumns: string[];
    expiresInHours: number;
  };
  canCommit: boolean;
  requiresAcceptSkipped: boolean;
  syncBlockedReason: string | null;
  problems: ImportRow[];
  problemsShown: number;
  sample: ImportRow[];
}

interface RowsResponse {
  rows: ImportRow[];
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 50;

export default function ImportPage() {
  const auth = useAuthGuard();
  const t = useTranslations('import');
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('update');
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<ApiError | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [rowOffset, setRowOffset] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const rowsQuery = useQuery({
    queryKey: ['import-rows', preview?.import.id, rowFilter, rowOffset],
    queryFn: () => {
      const statusParam = rowFilter === 'all' ? '' : `status=${rowFilter}&`;
      return api<RowsResponse>(
        `/v1/pharmacy/imports/${preview!.import.id}/rows?${statusParam}limit=${PAGE_SIZE}&offset=${rowOffset}`,
      );
    },
    enabled: auth.status === 'verified' && step === 2 && !!preview,
    staleTime: 30_000,
  });

    const filterTotal = useMemo(() => {
    if (!preview) return 0;
    switch (rowFilter) {
      case 'error':
        return preview.import.errorRows;
      case 'unmatched':
        return preview.import.unmatchedRows;
      case 'ok':
        return preview.import.okRows;
      default:
        return preview.import.totalRows;
    }
  }, [preview, rowFilter]);

  if (auth.status !== 'verified') return null;

  const rows = rowsQuery.data?.ok ? rowsQuery.data.data.rows : [];
  const rowsLoading = rowsQuery.isLoading;

  const showingFrom = rows.length === 0 ? 0 : rowOffset + 1;
  const showingTo = rowOffset + rows.length;
  const hasPrev = rowOffset > 0;
  const hasNext = showingTo < filterTotal;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setUploadError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setFileError(t('errorFileType'));
      setFile(null);
      return;
    }
    if (f.size === 0) {
      setFileError(t('errorFileEmpty'));
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError(t('errorFileSizeTooLarge'));
      setFile(null);
      return;
    }
    setFile(f);
  };

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append('file', file);

    const result = await api<PreviewResponse>(
      `/v1/pharmacy/imports?mode=${mode}`,
      { method: 'POST', body: form },
    );

    setUploading(false);

    if (!result.ok) {
      setUploadError(result.error);
      return;
    }

    setPreview(result.data);
    setStep(2);
    setRowFilter('all');
    setRowOffset(0);
  };

  const startOver = () => {
    setStep(1);
    setFile(null);
    setFileError(null);
    setUploadError(null);
    setPreview(null);
    setMode('update');
    setRowFilter('all');
    setRowOffset(0);
  };

  const changeFilter = (f: RowFilter) => {
    setRowFilter(f);
    setRowOffset(0);
  };

  const onDownloadErrors = async () => {
    if (!preview) return;
    setDownloading(true);
    const all: ImportRow[] = [];
    let offset = 0;
    // Page through the error rows. Bounded by the actual error count.
    while (true) {
      const res = await api<RowsResponse>(
        `/v1/pharmacy/imports/${preview.import.id}/rows?status=error&limit=100&offset=${offset}`,
      );
      if (!res.ok) break;
      all.push(...res.data.rows);
      if (res.data.rows.length < 100) break;
      offset += 100;
    }
    if (all.length > 0) {
      downloadCsv(
        `${preview.import.filename.replace(/\.csv$/i, '')}-errors.csv`,
        rowsToCsv(all),
      );
    }
    setDownloading(false);
  };

  return (
    <AppShell>
      <h1 className="text-lg font-semibold mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-600 mb-6">{t('subtitle')}</p>

      <StepIndicator step={step} />

      {step === 1 && (
        <form
          onSubmit={onUpload}
          className="bg-white rounded-lg border p-6 max-w-2xl space-y-4"
        >
          <div>
            <label className="block">
              <span className="text-sm font-medium">{t('fileLabel')}</span>
              <input
                type="file"
                onChange={onFileChange}
                disabled={uploading}
                className="mt-1 block w-full text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
              />
            </label>
            <p className="text-xs text-gray-500 mt-1">{t('fileHint')}</p>
            {fileError && (
              <p role="alert" className="text-xs text-danger-600 mt-1">
                {fileError}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-medium mb-1">{t('modeLabel')}</legend>
            <label className="flex items-start gap-2 mb-2">
              <input
                type="radio"
                name="mode"
                value="update"
                checked={mode === 'update'}
                onChange={() => setMode('update')}
                disabled={uploading}
                className="mt-1"
              />
              <span className="text-sm">{t('modeUpdate')}</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="mode"
                value="sync"
                checked={mode === 'sync'}
                onChange={() => setMode('sync')}
                disabled={uploading}
                className="mt-1"
              />
              <span className="text-sm">{t('modeSync')}</span>
            </label>
          </fieldset>

          {uploadError && (
            <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-2">
              {errorMessage(uploadError)}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!file || uploading}
              className="text-sm px-4 py-2 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {uploading ? t('uploading') : t('uploadButton')}
            </button>
          </div>
        </form>
      )}

      {step === 2 && preview && (
        <div className="space-y-4 max-w-5xl">
          <div className="bg-white rounded-lg border p-6 space-y-3">
            <h2 className="text-base font-semibold">{t('summaryTitle')}</h2>
            <div className="text-xs text-gray-600 space-y-0.5">
              <div>{t('summaryFilename', { filename: preview.import.filename })}</div>
              <div>
                {preview.import.mode === 'sync'
                  ? t('summaryModeSync')
                  : t('summaryModeUpdate')}
              </div>
            </div>

            <ul className="text-sm space-y-1 pt-2">
              <li>{t('summaryTotal', { count: preview.import.totalRows })}</li>
              <li className="text-success-600">
                {t('summaryOk', { count: preview.import.okRows })}
              </li>
              {preview.import.errorRows > 0 && (
                <li className="text-danger-600">
                  {t('summaryError', { count: preview.import.errorRows })}
                </li>
              )}
              {preview.import.unmatchedRows > 0 && (
                <li className="text-amber-700">
                  {t('summaryUnmatched', { count: preview.import.unmatchedRows })}
                </li>
              )}
              <li>{t('summaryProductsToUpdate', { count: preview.import.productsToUpdate })}</li>
              {preview.import.mergedRows > 0 && (
                <li>{t('summaryMergedRows', { count: preview.import.mergedRows })}</li>
              )}
              {preview.import.mode === 'sync' &&
                preview.import.willMarkOutOfStock !== null &&
                preview.import.willMarkOutOfStock > 0 && (
                  <li className="text-amber-700">
                    {t('summaryWillMarkOutOfStock', {
                      count: preview.import.willMarkOutOfStock,
                    })}
                  </li>
                )}
            </ul>

            {preview.import.ignoredColumns.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-medium text-gray-600">
                  {t('ignoredColumnsTitle')}
                </div>
                <div className="text-xs text-gray-500">
                  {preview.import.ignoredColumns.join(', ')}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 pt-2">
              {t('expiresIn', { hours: preview.import.expiresInHours })}
            </p>
          </div>

          {preview.syncBlockedReason && (
            <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-3">
              {t('syncBlocked')}
            </div>
          )}

          {preview.requiresAcceptSkipped && (
            <div className="text-sm text-amber-800 bg-amber-50 rounded p-3">
              {t('requiresAcceptSkipped')}
            </div>
          )}

          <div className="bg-white rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b">
              <div className="flex gap-1" role="tablist">
                <FilterButton
                  label={t('filterAll')}
                  active={rowFilter === 'all'}
                  onClick={() => changeFilter('all')}
                />
                <FilterButton
                  label={t('filterErrors')}
                  active={rowFilter === 'error'}
                  onClick={() => changeFilter('error')}
                />
                <FilterButton
                  label={t('filterUnmatched')}
                  active={rowFilter === 'unmatched'}
                  onClick={() => changeFilter('unmatched')}
                />
                <FilterButton
                  label={t('filterOk')}
                  active={rowFilter === 'ok'}
                  onClick={() => changeFilter('ok')}
                />
              </div>
              {preview.import.errorRows > 0 && (
                <button
                  type="button"
                  onClick={onDownloadErrors}
                  disabled={downloading}
                  className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('downloadErrors')}
                </button>
              )}
            </div>

            {rowsLoading && (
              <div className="p-6 text-sm text-gray-500">Loading…</div>
            )}

            {!rowsLoading && rows.length === 0 && (
              <div className="p-6 text-sm text-gray-500">{t('noRowsInFilter')}</div>
            )}

            {!rowsLoading && rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((r) => (
                      <ImportRowItem key={r.row_number} row={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filterTotal > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t text-xs text-gray-600">
                <span>
                  {t('pageShowing', {
                    from: showingFrom,
                    to: showingTo,
                    total: filterTotal,
                  })}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={() => setRowOffset(Math.max(0, rowOffset - PAGE_SIZE))}
                    className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t('prevPage')}
                  </button>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => setRowOffset(rowOffset + PAGE_SIZE)}
                    className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t('nextPage')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={startOver}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
            >
              {t('startOver')}
            </button>
            <button
              type="button"
              disabled
              title={t('comingSoonStep3')}
              className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white disabled:opacity-50"
            >
              {t('continue')}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const t = useTranslations('import');
  const labels: Array<{ n: Step; key: 'step1' | 'step2' | 'step3' }> = [
    { n: 1, key: 'step1' },
    { n: 2, key: 'step2' },
    { n: 3, key: 'step3' },
  ];
  return (
    <ol className="flex gap-4 mb-6 text-sm">
      {labels.map((l) => {
        const done = step > l.n;
        const active = step === l.n;
        return (
          <li key={l.n} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                active
                  ? 'bg-brand-600 text-white'
                  : done
                    ? 'bg-success-500 text-white'
                    : 'bg-gray-200 text-gray-600'
              }`}
            >
              {done ? '✓' : l.n}
            </span>
            <span
              className={
                active ? 'font-medium text-gray-900' : done ? 'text-gray-700' : 'text-gray-400'
              }
            >
              {t(l.key)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded ${
        active
          ? 'bg-brand-600 text-white'
          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function ImportRowItem({ row }: { row: ImportRow }) {
  const t = useTranslations('import');
  const raw = row.raw ?? {};
  const brand = String(raw.brand_name ?? '');
  const strength = String(raw.strength ?? '');
  const issues = [...row.errors, ...row.warnings];

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2 w-12 text-right text-xs text-gray-500">
        #{row.row_number}
      </td>
      <td className="px-3 py-2 w-24">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-3 py-2">
        <div className="font-medium">{brand || '—'}</div>
        {strength && <div className="text-xs text-gray-500">{strength}</div>}
      </td>
      <td className="px-3 py-2 text-right w-16">
        {row.quantity ?? (typeof raw.quantity === 'number' ? raw.quantity : '—')}
      </td>
      <td className="px-3 py-2 text-xs text-gray-600 w-28">
        {row.expiry_date ?? String(raw.expiry_date ?? '—')}
      </td>
      <td className="px-3 py-2 text-xs">
        {issues.length > 0 && (
          <ul className="list-disc ml-4 text-danger-600">
            {issues.slice(0, 3).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
            {issues.length > 3 && (
              <li className="text-gray-500">+{issues.length - 3} more</li>
            )}
          </ul>
        )}
        {row.status === 'unmatched' && row.suggestions && row.suggestions.length > 0 && (
          <div className="text-gray-600">
            <span className="text-xs">{t('notInCatalog')} → </span>
            {row.suggestions.map((s) => (
              <span key={s.id} className="text-xs mr-2">
                {s.brand_name} {s.strength}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: 'ok' | 'error' | 'unmatched' }) {
  const t = useTranslations('import');
  const cls =
    status === 'ok'
      ? 'bg-success-50 text-success-600'
      : status === 'error'
        ? 'bg-danger-50 text-danger-600'
        : 'bg-amber-50 text-amber-700';
  const label =
    status === 'ok'
      ? t('rowStatusOk')
      : status === 'error'
        ? t('rowStatusError')
        : t('rowStatusUnmatched');
  return <span className={`inline-block text-xs px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}