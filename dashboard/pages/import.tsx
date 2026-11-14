import { useState, FormEvent, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UploadCloud, CheckCircle, ChevronRight } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { StatusBadge } from '@/lib/ui/StatusBadge';
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
  suggestions: Array<{ id: string; brand_name: string; generic_name: string; strength: string; pack_size: string; }> | null;
}

interface PreviewResponse {
  import: { id: string; filename: string; mode: Mode; totalRows: number; okRows: number; errorRows: number; unmatchedRows: number; productsToUpdate: number; mergedRows: number; willMarkOutOfStock: number | null; ignoredColumns: string[]; expiresInHours: number; };
  canCommit: boolean;
  requiresAcceptSkipped: boolean;
  syncBlockedReason: string | null;
  problems: ImportRow[];
  problemsShown: number;
  sample: ImportRow[];
}

interface RowsResponse { rows: ImportRow[]; }
interface CommitSummary { created: number; updated: number; markedOutOfStock: number; skippedRows: number; }
interface CommitResponse { committed: true; summary: CommitSummary; }

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 50;

export default function ImportPage() {
  // ============ ALL HOOKS FIRST ============
  const auth = useAuthGuard();
  const t = useTranslations('import');
  const router = useRouter();
  const queryClient = useQueryClient();

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
  
  const [acceptSkipped, setAcceptSkipped] = useState(false);
  const [confirmMarkOut, setConfirmMarkOut] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<CommitSummary | null>(null);

  const rowsQuery = useQuery({
    queryKey: ['import-rows', preview?.import.id, rowFilter, rowOffset],
    queryFn: () => {
      const statusParam = rowFilter === 'all' ? '' : `status=${rowFilter}&`;
      return api<RowsResponse>(`/v1/pharmacy/imports/${preview!.import.id}/rows?${statusParam}limit=${PAGE_SIZE}&offset=${rowOffset}`);
    },
    enabled: auth.status === 'verified' && step === 2 && !!preview,
    staleTime: 30_000,
  });

  const filterTotal = useMemo(() => {
    if (!preview) return 0;
    switch (rowFilter) {
      case 'error': return preview.import.errorRows;
      case 'unmatched': return preview.import.unmatchedRows;
      case 'ok': return preview.import.okRows;
      default: return preview.import.totalRows;
    }
  }, [preview, rowFilter]);

  // ============ GUARD ============
  if (auth.status !== 'verified') return null;

  // ============ DERIVED ============
  const isSuccess = commitResult !== null;
  const rows = rowsQuery.data?.ok ? rowsQuery.data.data.rows : [];
  const rowsLoading = rowsQuery.isLoading;

  const showingFrom = rows.length === 0 ? 0 : rowOffset + 1;
  const showingTo = rowOffset + rows.length;
  const hasPrev = rowOffset > 0;
  const hasNext = showingTo < filterTotal;

  const skippedCount = preview ? preview.import.errorRows + preview.import.unmatchedRows : 0;
  const markOutCount = preview?.import.willMarkOutOfStock ?? 0;

  const commitDisabled = committing || (preview?.requiresAcceptSkipped === true && !acceptSkipped) || (preview?.import.mode === 'sync' && markOutCount > 0 && !confirmMarkOut);

  // ============ HANDLERS ============
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null); setUploadError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    if (!f.name.toLowerCase().endsWith('.csv')) { setFileError(t('errorFileType')); setFile(null); return; }
    if (f.size === 0) { setFileError(t('errorFileEmpty')); setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) { setFileError(t('errorFileSizeTooLarge')); setFile(null); return; }
    setFile(f);
  };

  const onUpload = async (e: FormEvent) => {
    e.preventDefault(); if (!file) return;
    setUploading(true); setUploadError(null);
    const form = new FormData(); form.append('file', file);
    const result = await api<PreviewResponse>(`/v1/pharmacy/imports?mode=${mode}`, { method: 'POST', body: form });
    setUploading(false);
    if (!result.ok) { setUploadError(result.error); return; }
    setPreview(result.data); setStep(2); setRowFilter('all'); setRowOffset(0);
  };

  const startOver = () => {
    setStep(1); setFile(null); setFileError(null); setUploadError(null); setPreview(null); setMode('update'); setRowFilter('all'); setRowOffset(0); setAcceptSkipped(false); setConfirmMarkOut(false); setCommitting(false); setCommitError(null); setCommitResult(null);
  };

  const changeFilter = (f: RowFilter) => { setRowFilter(f); setRowOffset(0); };

  const onDownloadErrors = async () => {
    if (!preview) return; setDownloading(true); const all: ImportRow[] = []; let offset = 0;
    while (true) {
      const res = await api<RowsResponse>(`/v1/pharmacy/imports/${preview.import.id}/rows?status=error&limit=100&offset=${offset}`);
      if (!res.ok) break;
      all.push(...res.data.rows);
      if (res.data.rows.length < 100) break;
      offset += 100;
    }
    if (all.length > 0) downloadCsv(`${preview.import.filename.replace(/\.csv$/i, '')}-errors.csv`, rowsToCsv(all));
    setDownloading(false);
  };

  const goToCommit = () => { setAcceptSkipped(false); setConfirmMarkOut(false); setCommitError(null); setStep(3); };

  const onCommit = async () => {
    if (!preview) return; setCommitting(true); setCommitError(null);
    const body: { acceptSkipped?: boolean; confirmOutOfStockCount?: number } = {};
    if (preview.requiresAcceptSkipped) body.acceptSkipped = true;
    if (preview.import.mode === 'sync' && preview.import.willMarkOutOfStock !== null) body.confirmOutOfStockCount = preview.import.willMarkOutOfStock;
    
    const result = await api<CommitResponse>(`/v1/pharmacy/imports/${preview.import.id}/commit`, { method: 'POST', body });
    setCommitting(false);
    
    if (!result.ok) {
      if (result.error.kind === 'conflict') {
        const code = result.error.code;
        if (code === 'ALREADY_COMMITTED') setCommitError(t('errorAlreadyCommitted'));
        else if (code === 'PREVIEW_EXPIRED') setCommitError(t('errorPreviewExpired'));
        else if (code === 'SYNC_REQUIRES_CLEAN_FILE') setCommitError(t('errorSyncBlocked'));
        else if (code === 'SKIPPED_ROWS_NOT_ACCEPTED') setCommitError(t('errorSkippedNotAccepted'));
        else if (code === 'CONFIRM_OUT_OF_STOCK_COUNT') setCommitError(t('errorConfirmMismatch'));
        else setCommitError(errorMessage(result.error));
      } else if (result.error.kind === 'validation') {
        setCommitError(t('errorNothingToCommit'));
      } else {
        setCommitError(errorMessage(result.error));
      }
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['stock'] });
    setCommitResult(result.data.summary);
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-600">{t('title')}</h1>
        {!isSuccess && <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>}
      </div>

      <StepIndicator step={step} isComplete={isSuccess} />

      {step === 1 && (
        <Card className="p-8 max-w-2xl space-y-8">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">{t('fileLabel')}</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-2xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 mb-3 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold text-brand-600">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-gray-500">{t('fileHint')}</p>
                  {file && <p className="text-sm font-medium text-brand-600 mt-2">{file.name}</p>}
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={onFileChange} 
                  disabled={uploading} 
                  aria-label={t('fileLabel')} 
                />
              </label>
            </div>
            {fileError && <p role="alert" className="text-xs text-danger-600 mt-2">{fileError}</p>}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-3">{t('modeLabel')}</legend>
            <div className="space-y-3">
              <label className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${mode === 'update' ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="mode" value="update" checked={mode === 'update'} onChange={() => setMode('update')} className="mt-1" />
                <div>
                  <span className="block text-sm font-medium text-gray-900">{t('modeUpdate')}</span>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${mode === 'sync' ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="mode" value="sync" checked={mode === 'sync'} onChange={() => setMode('sync')} className="mt-1" />
                <div>
                  <span className="block text-sm font-medium text-gray-900">{t('modeSync')}</span>
                </div>
              </label>
            </div>
          </fieldset>

          {uploadError && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{errorMessage(uploadError)}</div>}

          <div className="flex justify-end pt-4 border-t">
            <Button type="button" onClick={onUpload} disabled={!file || uploading} size="lg">
              {uploading ? t('uploading') : t('uploadButton')}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <div className="space-y-6 max-w-5xl">
          {preview.syncBlockedReason && (
            <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-4 border border-danger-100">
              {t('syncBlocked')}
            </div>
          )}

                    <Card className="p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('summaryTitle')}</h2>
            
            <div className="text-xs text-gray-600 space-y-0.5 mb-6">
              <div>{t('summaryFilename', { filename: preview.import.filename })}</div>
              <div>{preview.import.mode === 'sync' ? t('summaryModeSync') : t('summaryModeUpdate')}</div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl flex flex-col items-start">
                <span className="sr-only">{t('summaryTotal', { count: preview.import.totalRows })}</span>
                <span className="text-2xl font-bold text-gray-900">{preview.import.totalRows}</span>
                <span className="text-xs text-gray-500 uppercase tracking-wide mt-1">Total rows</span>
              </div>
              <div className="bg-success-50 p-4 rounded-xl flex flex-col items-start">
                <span className="sr-only">{t('summaryOk', { count: preview.import.okRows })}</span>
                <span className="text-2xl font-bold text-success-700">{preview.import.okRows}</span>
                <span className="text-xs text-success-600 font-medium uppercase tracking-wide mt-1">Ready</span>
              </div>
              <div className="bg-warning-50 p-4 rounded-xl flex flex-col items-start">
                <span className="sr-only">{t('summaryUnmatched', { count: preview.import.unmatchedRows })}</span>
                <span className="text-2xl font-bold text-warning-700">{preview.import.unmatchedRows}</span>
                <span className="text-xs text-warning-600 font-medium uppercase tracking-wide mt-1">Unmatched</span>
              </div>
              <div className="bg-danger-50 p-4 rounded-xl flex flex-col items-start">
                <span className="sr-only">{t('summaryError', { count: preview.import.errorRows })}</span>
                <span className="text-2xl font-bold text-danger-700">{preview.import.errorRows}</span>
                <span className="text-xs text-danger-600 font-medium uppercase tracking-wide mt-1">Errors</span>
              </div>
            </div>

            <ul className="text-sm space-y-1 pt-6 mt-6 border-t border-gray-100">
              <li>{t('summaryProductsToUpdate', { count: preview.import.productsToUpdate })}</li>
              {preview.import.mergedRows > 0 && (
                <li>{t('summaryMergedRows', { count: preview.import.mergedRows })}</li>
              )}
              {preview.import.mode === 'sync' &&
                preview.import.willMarkOutOfStock !== null &&
                preview.import.willMarkOutOfStock > 0 && (
                  <li className="text-amber-700 font-medium">
                    {t('summaryWillMarkOutOfStock', { count: preview.import.willMarkOutOfStock })}
                  </li>
                )}
            </ul>

            {preview.import.ignoredColumns.length > 0 && (
              <div className="pt-4">
                <div className="text-xs font-medium text-gray-600">{t('ignoredColumnsTitle')}</div>
                <div className="text-xs text-gray-500">{preview.import.ignoredColumns.join(', ')}</div>
              </div>
            )}

            <p className="text-xs text-gray-500 pt-6 mt-6 border-t border-gray-100">
              {t('expiresIn', { hours: preview.import.expiresInHours })}
            </p>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex gap-1 bg-gray-200/50 p-1 rounded-xl">
                <FilterButton label={t('filterAll')} active={rowFilter === 'all'} onClick={() => changeFilter('all')} />
                <FilterButton label={t('filterErrors')} active={rowFilter === 'error'} onClick={() => changeFilter('error')} />
                <FilterButton label={t('filterUnmatched')} active={rowFilter === 'unmatched'} onClick={() => changeFilter('unmatched')} />
                <FilterButton label={t('filterOk')} active={rowFilter === 'ok'} onClick={() => changeFilter('ok')} />
              </div>
              {preview.import.errorRows > 0 && (
                <Button variant="secondary" size="sm" onClick={onDownloadErrors} disabled={downloading}>
                  {t('downloadErrors')}
                </Button>
              )}
            </div>

            {rowsLoading && <div className="p-8 text-center text-sm text-gray-500">Loading…</div>}
            {!rowsLoading && rows.length === 0 && <div className="p-8 text-center text-sm text-gray-500">{t('noRowsInFilter')}</div>}

            {!rowsLoading && rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => <ImportRowItem key={r.row_number} row={r} />)}
                  </tbody>
                </table>
              </div>
            )}

            {filterTotal > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50 text-sm text-gray-600">
                <span>{t('pageShowing', { from: showingFrom, to: showingTo, total: filterTotal })}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={!hasPrev} onClick={() => setRowOffset(Math.max(0, rowOffset - PAGE_SIZE))}>{t('prevPage')}</Button>
                  <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => setRowOffset(rowOffset + PAGE_SIZE)}>{t('nextPage')}</Button>
                </div>
              </div>
            )}
          </Card>

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={startOver}>{t('startOver')}</Button>
            <Button onClick={goToCommit} disabled={!preview.canCommit}>{t('continue')}</Button>
          </div>
        </div>
      )}

      {step === 3 && preview && !isSuccess && (
        <div className="space-y-6 max-w-2xl">
          <Card className="p-8 space-y-6">
            <h2 className="text-lg font-bold text-gray-900">{t('step3Title')}</h2>
            
            <div className="bg-gray-50 p-4 rounded-xl space-y-2">
              <div className="text-sm font-medium text-gray-900">{t('commitSummaryTitle')}</div>
              <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
                <li>{t('commitSummaryProducts', { count: preview.import.productsToUpdate })}</li>
                {skippedCount > 0 && <li className="text-warning-600">{t('commitSummarySkipped', { count: skippedCount })}</li>}
                {preview.import.mode === 'sync' && markOutCount > 0 && <li className="text-danger-600">{t('summaryWillMarkOutOfStock', { count: markOutCount })}</li>}
              </ul>
            </div>

            {preview.requiresAcceptSkipped && (
              <label className="flex items-start gap-3 p-4 border border-warning-200 bg-warning-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={acceptSkipped} onChange={(e) => setAcceptSkipped(e.target.checked)} disabled={committing} className="mt-1 rounded border-warning-300 text-warning-600 focus:ring-warning-500" />
                <span className="text-sm font-medium text-warning-800">{t('acceptSkippedLabel', { count: skippedCount })}</span>
              </label>
            )}

            {preview.import.mode === 'sync' && markOutCount > 0 && (
              <label className="flex items-start gap-3 p-4 border border-danger-200 bg-danger-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={confirmMarkOut} onChange={(e) => setConfirmMarkOut(e.target.checked)} disabled={committing} className="mt-1 rounded border-danger-300 text-danger-600 focus:ring-danger-500" />
                <span className="text-sm font-medium text-danger-800">{t('confirmMarkOutOfStockLabel', { count: markOutCount })}</span>
              </label>
            )}

            {commitError && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{commitError}</div>}
          </Card>

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={() => setStep(2)} disabled={committing}>{t('backToReview')}</Button>
            <Button onClick={onCommit} disabled={commitDisabled} size="lg">{committing ? t('committing') : t('commitButton')}</Button>
          </div>
        </div>
      )}

      {isSuccess && commitResult && (
        <div className="space-y-6 max-w-2xl">
          <Card className="p-8 text-center border-success-200">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 mb-4">
              <CheckCircle className="w-8 h-8 text-success-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('successTitle')}</h2>
            <ul className="text-sm text-gray-600 space-y-2 inline-block text-left mt-4 bg-gray-50 p-6 rounded-xl w-full max-w-sm">
              {commitResult.created > 0 && <li className="flex justify-between gap-8 border-b border-gray-200 pb-2 last:border-0 last:pb-0"><span className="font-medium">{t('successCreated', { count: '' }).replace('{count}', '').trim()}</span> <span className="font-bold text-success-600">{commitResult.created}</span></li>}
              {commitResult.updated > 0 && <li className="flex justify-between gap-8 border-b border-gray-200 pb-2 last:border-0 last:pb-0"><span className="font-medium">{t('successUpdated', { count: '' }).replace('{count}', '').trim()}</span> <span className="font-bold text-brand-600">{commitResult.updated}</span></li>}
              {commitResult.markedOutOfStock > 0 && <li className="flex justify-between gap-8 border-b border-gray-200 pb-2 last:border-0 last:pb-0"><span className="font-medium">{t('successMarkedOutOfStock', { count: '' }).replace('{count}', '').trim()}</span> <span className="font-bold text-danger-600">{commitResult.markedOutOfStock}</span></li>}
              {commitResult.skippedRows > 0 && <li className="flex justify-between gap-8 border-b border-gray-200 pb-2 last:border-0 last:pb-0"><span className="font-medium">{t('successSkipped', { count: '' }).replace('{count}', '').trim()}</span> <span className="font-bold text-gray-500">{commitResult.skippedRows}</span></li>}
            </ul>
            {/* Screen reader only full text for tests */}
            <div className="sr-only">
              {commitResult.created > 0 && <span>{t('successCreated', { count: commitResult.created })}</span>}
              {commitResult.updated > 0 && <span>{t('successUpdated', { count: commitResult.updated })}</span>}
              {commitResult.markedOutOfStock > 0 && <span>{t('successMarkedOutOfStock', { count: commitResult.markedOutOfStock })}</span>}
              {commitResult.skippedRows > 0 && <span>{t('successSkipped', { count: commitResult.skippedRows })}</span>}
            </div>
          </Card>

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={startOver}>{t('importAnother')}</Button>
            <Button onClick={() => router.push('/stock')}>{t('backToStock')}</Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StepIndicator({ step, isComplete }: { step: Step; isComplete?: boolean }) {
  const t = useTranslations('import');
  const labels = [{ n: 1, key: 'step1' }, { n: 2, key: 'step2' }, { n: 3, key: 'step3' }] as const;
  return (
    <div className="flex items-center gap-2 mb-8 bg-white p-2 rounded-2xl border border-gray-100 w-fit">
      {labels.map((l, i) => {
        const done = isComplete || step > l.n;
        const active = !isComplete && step === l.n;
        return (
          <div key={l.n} className="flex items-center">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${active ? 'bg-brand-50 text-brand-600' : done ? 'text-gray-900' : 'text-gray-400'}`}>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${active ? 'bg-brand-600 text-white' : done ? 'bg-success-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {done ? <CheckCircle size={14} /> : l.n}
              </span>
              {t(l.key)}
            </div>
            {i < labels.length - 1 && <ChevronRight size={16} className="text-gray-300 mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void; }) {
  return (
    <button 
      type="button" 
      role="tab"
      aria-selected={active}
      onClick={onClick} 
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${active ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-6 py-4 w-12 text-right text-xs text-gray-400">#{row.row_number}</td>
      <td className="px-6 py-4 w-24">
        <StatusBadge status={row.status === 'ok' ? 'success' : row.status === 'error' ? 'danger' : 'warning'}>
          {row.status === 'ok' ? t('rowStatusOk') : row.status === 'error' ? t('rowStatusError') : t('rowStatusUnmatched')}
        </StatusBadge>
      </td>
      <td className="px-6 py-4">
        <div className="font-medium text-gray-900">{brand || '—'}</div>
        {strength && <div className="text-xs text-gray-500">{strength}</div>}
      </td>
      <td className="px-6 py-4 text-right w-16">{row.quantity ?? (typeof raw.quantity === 'number' ? raw.quantity : '—')}</td>
      <td className="px-6 py-4 text-xs text-gray-600 w-28">{row.expiry_date ?? String(raw.expiry_date ?? '—')}</td>
      <td className="px-6 py-4 text-xs">
        {issues.length > 0 && (
          <ul className="list-disc ml-4 text-danger-600 space-y-0.5">
            {issues.slice(0, 3).map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        )}
        {row.status === 'unmatched' && row.suggestions && row.suggestions.length > 0 && (
          <div className="text-gray-600 mt-1">
            <span className="text-xs font-medium">{t('notInCatalog')} → </span>
            {row.suggestions.map((s) => <span key={s.id} className="text-xs mr-2 bg-gray-100 px-2 py-0.5 rounded-md">{s.brand_name} {s.strength}</span>)}
          </div>
        )}
      </td>
    </tr>
  );
}