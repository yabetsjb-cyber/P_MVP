import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ClipboardList } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api, errorMessage } from '@/lib/api';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { StatusBadge } from '@/lib/ui/StatusBadge';

type Scope = 'pending' | 'confirmed';
type TabKey = 'new' | 'active';

interface Reservation {
  id: string;
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'fulfilled' | 'expired';
  qty: number;
  requiresPrescription: boolean;
  respondBy: string;
  pickupBy: string | null;
  createdAt: string;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  closedAt: string | null;
  declineReason: string | null;
  closedReason: string | null;
  medicine: { id: string; brandName: string; genericName: string; strength: string; packSize: string; };
  customer: { name: string; phone: string | null; phoneVerified: boolean; noShowCount: number; };
}

interface ListResponse { reservations: Reservation[]; }
interface DeclineResponse { reservation: Reservation; markedOutOfStock: boolean; }
interface LookupResponse { reservation: Reservation; readyForPickup: boolean; }

const TABS: { key: TabKey; scope: Scope; labelKey: 'tabNew' | 'tabActive'; emptyKey: 'emptyNew' | 'emptyActive'; hintKey: 'emptyNewHint' | 'emptyActiveHint'; }[] = [
  { key: 'new', scope: 'pending', labelKey: 'tabNew', emptyKey: 'emptyNew', hintKey: 'emptyNewHint' },
  { key: 'active', scope: 'confirmed', labelKey: 'tabActive', emptyKey: 'emptyActive', hintKey: 'emptyActiveHint' },
];

export default function ReservationsPage() {
  const auth = useAuthGuard();
  const t = useTranslations('reservations');
  const tCommon = useTranslations('common');
  const [tab, setTab] = useState<TabKey>('new');
  const [confirming, setConfirming] = useState<Reservation | null>(null);
  const [declining, setDeclining] = useState<Reservation | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  const currentTab = TABS.find((x) => x.key === tab) ?? TABS[0];

  const query = useQuery({
    queryKey: ['reservations', currentTab.scope],
    queryFn: () => api<ListResponse>(`/v1/pharmacy/reservations?scope=${currentTab.scope}&limit=50`),
    enabled: auth.status === 'verified',
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  if (auth.status !== 'verified') return null;

  const items = query.data?.ok ? query.data.data.reservations : [];

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-brand-600">{t('title')}</h1>
        <Button onClick={() => setLookupOpen(true)} variant="primary">
          {t('lookupButton')}
        </Button>
      </div>

      <div className="mb-6 flex space-x-2 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((tb) => {
          const active = tb.key === tab;
          return (
            <button
              key={tb.key} onClick={() => setTab(tb.key)}
              role="tab"                      
              aria-selected={active} 
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t(tb.labelKey)}
            </button>
          );
        })}
      </div>

      {query.isLoading && <p className="text-sm text-gray-500">{tCommon('loading')}</p>}

      {query.data && !query.data.ok && (
        <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-4">{errorMessage(query.data.error)}</div>
      )}

      {query.data?.ok && items.length === 0 && (
        <Card className="p-12 text-center flex flex-col items-center">
          <ClipboardList size={48} className="text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-1">{t(currentTab.emptyKey)}</p>
          <p className="text-sm text-gray-500">{t(currentTab.hintKey)}</p>
        </Card>
      )}

      {query.data?.ok && items.length > 0 && (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((r) => (
            <ReservationCard key={r.id} reservation={r} onConfirm={r.status === 'requested' ? () => setConfirming(r) : undefined} onDecline={() => setDeclining(r)} />
          ))}
        </ul>
      )}

      {confirming && <ConfirmDialog reservation={confirming} onClose={() => setConfirming(null)} />}
      {declining && <DeclineDialog reservation={declining} onClose={() => setDeclining(null)} />}
      {lookupOpen && <LookupDialog onClose={() => setLookupOpen(false)} />}
    </AppShell>
  );
}

function ReservationCard({ reservation: r, onConfirm, onDecline }: { reservation: Reservation; onConfirm?: () => void; onDecline: () => void; }) {
  const t = useTranslations('reservations');
  const deadline = r.status === 'requested' ? r.respondBy : r.pickupBy;
  const isPending = r.status === 'requested';
  const deadlineLabel = deadline ? (isPending ? t('respondBy', { time: formatTime(deadline) }) : t('pickupBy', { time: formatTime(deadline) })) : '';
  const countdown = deadline ? relativeTo(deadline) : null;
  const countdownText = countdown ? (countdown.overdue ? t(isPending ? 'respondOverdue' : 'pickupOverdue') : countdown.hours >= 1 ? t('respondInHours', { hours: countdown.hours }) : t('respondIn', { minutes: countdown.minutes })) : null;

  return (
    <Card className="p-5 flex flex-col gap-4 hover:border-brand-100 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-bold text-gray-900 flex items-center gap-2 text-lg">
            {r.medicine.brandName}
            {r.requiresPrescription && <StatusBadge status="warning">{t('rxRequired')}</StatusBadge>}
          </div>
          <div className="text-sm text-gray-500 mt-1">{r.medicine.genericName} · {r.medicine.strength} · {r.medicine.packSize}</div>
        </div>
        <div className="text-sm font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-lg shrink-0">{t('qty', { count: r.qty })}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm border-t border-gray-100 pt-4">
        <div className="text-gray-700 font-medium">
          {r.customer.name} {r.customer.phone && <span className="text-gray-400 font-normal ml-2">{r.customer.phone}</span>}
        </div>
        {deadline && (
          <div className={`text-xs ${countdown?.overdue ? 'text-danger-600 font-bold bg-danger-50 px-2 py-1 rounded-md' : 'text-gray-500'}`}>
            {deadlineLabel} {countdownText && <span className="ml-1 opacity-80">· {countdownText}</span>}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onConfirm && <Button size="sm" onClick={onConfirm}>{t('confirmButton')}</Button>}
        <Button size="sm" variant="secondary" onClick={onDecline} className="text-danger-600 border-danger-200 hover:bg-danger-50">{t('declineButton')}</Button>
      </div>
    </Card>
  );
}

// Modals updated with premium styling
function ConfirmDialog({ reservation, onClose }: { reservation: Reservation; onClose: () => void; }) {
  const t = useTranslations('reservations'); const tCommon = useTranslations('common'); const queryClient = useQueryClient();
  const [holdMinutes, setHoldMinutes] = useState(120); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null);
  
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [submitting, onClose]);

  const onSubmit = async () => {
    setSubmitting(true); setError(null);
    const result = await api(`/v1/pharmacy/reservations/${reservation.id}/confirm`, { method: 'POST', body: { holdMinutes } });
    setSubmitting(false);
    
    if (!result.ok) {
      if (result.error.kind === 'conflict') {
        const code = result.error.code;
        if (code === 'RESPONSE_WINDOW_PASSED') setError(t('confirmErrorResponsePassed'));
        else if (code === 'INVALID_STATE') setError(t('confirmErrorInvalidState'));
        else setError(errorMessage(result.error));
      } else if (result.error.kind === 'forbidden') {
        setError(t('confirmErrorNotVerified'));
      } else {
        setError(errorMessage(result.error));
      }
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
      return;
    }

    // Success path
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reservations'] }),
      queryClient.invalidateQueries({ queryKey: ['reservations-summary'] })
    ]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }} role="presentation">
      <div role="dialog" className="bg-white rounded-3xl shadow-float max-w-md w-full p-6 space-y-5">
        <h2 className="text-xl font-bold text-gray-900">{t('confirmTitle')}</h2>
        <p className="text-sm font-semibold text-brand-600 bg-brand-50 p-3 rounded-xl">{reservation.medicine.brandName} · {reservation.medicine.strength}</p>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('pickupWindowLabel')}</span>
          <select value={holdMinutes} onChange={(e) => setHoldMinutes(Number(e.target.value))} disabled={submitting} className="mt-1 w-full rounded-xl border-gray-300 focus:border-brand-500 focus:ring-brand-500">
            <option value={30}>{t('pickupDuration30m')}</option><option value={60}>{t('pickupDuration1h')}</option><option value={90}>{t('pickupDuration90m')}</option>
            <option value={120}>{t('pickupDuration2h')}</option><option value={180}>{t('pickupDuration3h')}</option><option value={240}>{t('pickupDuration4h')}</option>
          </select>
        </label>
        {error && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>{tCommon('cancel')}</Button>
          <Button onClick={onSubmit} disabled={submitting}>{submitting ? t('confirming') : t('confirmButton')}</Button>
        </div>
      </div>
    </div>
  );
}

function DeclineDialog({ reservation, onClose }: { reservation: Reservation; onClose: () => void; }) {
  const t = useTranslations('reservations'); const tCommon = useTranslations('common'); const queryClient = useQueryClient();
  const [reason, setReason] = useState<'out_of_stock' | 'closed' | 'other'>('out_of_stock'); const [note, setNote] = useState(''); const [alsoMarkOutOfStock, setAlsoMarkOutOfStock] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null);
  
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [submitting, onClose]);

  const onSubmit = async () => {
    setError(null);
    if (reason === 'other' && note.trim().length < 3) { setError(t('declineErrorNoteRequired')); return; }
    const body: { reason: string; note?: string; alsoMarkOutOfStock?: boolean; } = { reason };
    if (reason === 'other') body.note = note.trim();
    else if (reason === 'out_of_stock') { if (!alsoMarkOutOfStock) body.alsoMarkOutOfStock = false; }
    setSubmitting(true);
    const result = await api<DeclineResponse>(`/v1/pharmacy/reservations/${reservation.id}/decline`, { method: 'POST', body });
    setSubmitting(false);
    
    if (!result.ok) { 
      setError(errorMessage(result.error)); 
      await queryClient.invalidateQueries({ queryKey: ['reservations'] }); 
      return; 
    }
    
    const invalidations: Promise<unknown>[] = [
      queryClient.invalidateQueries({ queryKey: ['reservations'] }), 
      queryClient.invalidateQueries({ queryKey: ['reservations-summary'] })
    ];
    if (result.data.markedOutOfStock) invalidations.push(queryClient.invalidateQueries({ queryKey: ['stock'] }));
    await Promise.all(invalidations);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }} role="presentation">
      <div role="dialog" className="bg-white rounded-3xl shadow-float max-w-md w-full p-6 space-y-5">
        <h2 className="text-xl font-bold text-gray-900">{t('declineTitle')}</h2>
        <p className="text-sm font-semibold text-brand-600 bg-brand-50 p-3 rounded-xl">{reservation.medicine.brandName} · {reservation.medicine.strength}</p>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('declineReasonLabel')}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} disabled={submitting} className="mt-1 w-full rounded-xl border-gray-300 focus:border-brand-500 focus:ring-brand-500">
            <option value="out_of_stock">{t('declineReasonOutOfStock')}</option><option value="closed">{t('declineReasonClosed')}</option><option value="other">{t('declineReasonOther')}</option>
          </select>
        </label>
        {reason === 'other' && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">{t('declineNoteLabel')}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={submitting} rows={3} className="mt-1 w-full rounded-xl border-gray-300 focus:border-brand-500 focus:ring-brand-500" />
          </label>
        )}
        {reason === 'out_of_stock' && (
          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={alsoMarkOutOfStock} onChange={(e) => setAlsoMarkOutOfStock(e.target.checked)} disabled={submitting} className="mt-1 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm font-medium text-gray-700">{t('declineAlsoMarkOutOfStock')}</span>
          </label>
        )}
        {error && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>{tCommon('cancel')}</Button>
          <Button variant="danger" onClick={onSubmit} disabled={submitting}>{submitting ? t('declining') : t('declineConfirmButton')}</Button>
        </div>
      </div>
    </div>
  );
}

function LookupDialog({ onClose }: { onClose: () => void; }) {
  const t = useTranslations('reservations'); const tCommon = useTranslations('common'); const queryClient = useQueryClient();
  const [code, setCode] = useState(''); const [reservation, setReservation] = useState<Reservation | null>(null); const [readyForPickup, setReadyForPickup] = useState(false); const [lookingUp, setLookingUp] = useState(false); const [fulfilling, setFulfilling] = useState(false); const [error, setError] = useState<string | null>(null);
  const codeComplete = code.length === 6;

  const onCodeChange = (raw: string) => {
    setCode(raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').slice(0, 6));
    setError(null);
  };

  const onLookup = async () => {
    if (!codeComplete) return; setError(null); setLookingUp(true);
    const result = await api<LookupResponse>('/v1/pharmacy/reservations/lookup', { method: 'POST', body: { code } });
    setLookingUp(false);
    if (!result.ok) { setError(result.error.kind === 'not_found' ? t('lookupErrorNotFound') : errorMessage(result.error)); return; }
    setReservation(result.data.reservation); setReadyForPickup(result.data.readyForPickup);
  };

  const onHandOver = async () => {
    if (!reservation) return; setError(null); setFulfilling(true);
    if (!readyForPickup) {
      const confirmResult = await api(`/v1/pharmacy/reservations/${reservation.id}/confirm`, { method: 'POST', body: { holdMinutes: 120 } });
      if (!confirmResult.ok) { setFulfilling(false); setError(errorMessage(confirmResult.error)); return; }
    }
    
    const fulfilResult = await api(`/v1/pharmacy/reservations/${reservation.id}/fulfil`, { method: 'POST', body: { code } });
    setFulfilling(false);
    
    if (!fulfilResult.ok) {
      if (fulfilResult.error.kind === 'forbidden') {
        setError(t('fulfilErrorWrongCode')); // 403 is WRONG_CODE
      } else if (fulfilResult.error.kind === 'conflict' && fulfilResult.error.code === 'NOT_CONFIRMED') {
        setError(t('confirmErrorInvalidState'));
      } else if (fulfilResult.error.kind === 'conflict' && fulfilResult.error.code === 'INVALID_STATE') {
        setError(t('confirmErrorInvalidState'));
      } else {
        setError(errorMessage(fulfilResult.error));
      }
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
      return;
    }

    // Success path
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reservations'] }),
      queryClient.invalidateQueries({ queryKey: ['reservations-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] })
    ]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget && !lookingUp && !fulfilling) onClose(); }} role="presentation">
      <div role="dialog" className="bg-white rounded-3xl shadow-float max-w-md w-full p-6 space-y-5">
        <h2 className="text-xl font-bold text-gray-900">{t('lookupTitle')}</h2>
        {!reservation && (
          <>
            <p className="text-sm text-gray-600">{t('lookupSubtitle')}</p>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('codeLabel')}</span>
              <input type="text" maxLength={6} value={code} onChange={(e) => onCodeChange(e.target.value)} disabled={lookingUp} autoFocus className="mt-1 w-full rounded-xl border-gray-300 font-mono text-xl tracking-widest text-center focus:border-brand-500 focus:ring-brand-500 py-3" />
            </label>
            {error && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{error}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={onClose} disabled={lookingUp}>{tCommon('cancel')}</Button>
              <Button onClick={onLookup} disabled={!codeComplete || lookingUp}>{lookingUp ? t('lookingUp') : t('lookupSubmit')}</Button>
            </div>
          </>
        )}
        {reservation && (
          <>
            <div className="bg-brand-50 rounded-xl p-4 border border-brand-100 space-y-2">
              <div className="flex items-center justify-between font-bold text-brand-700">
                <span>{reservation.medicine.brandName}</span>
                <span>{t('qty', { count: reservation.qty })}</span>
              </div>
              <div className="text-sm text-brand-600/80">{reservation.customer.name} · {reservation.customer.phone}</div>
              <div className="pt-2">
                {readyForPickup ? <StatusBadge status="success">{t('readyForPickup')}</StatusBadge> : <StatusBadge status="warning">{t('notReadyConfirmFirst')}</StatusBadge>}
              </div>
            </div>
            {error && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{error}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={onClose} disabled={fulfilling}>{tCommon('close')}</Button>
              <Button onClick={onHandOver} disabled={fulfilling}>{fulfilling ? t('handingOver') : t('handOver')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function relativeTo(iso: string): { overdue: boolean; minutes: number; hours: number } {
  const diffMs = new Date(iso).getTime() - Date.now(); const overdue = diffMs < 0; const totalMinutes = Math.abs(Math.round(diffMs / 60_000));
  return { overdue, minutes: totalMinutes, hours: Math.round(totalMinutes / 60) };
}