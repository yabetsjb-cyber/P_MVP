import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api, errorMessage } from '@/lib/api';

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
  medicine: {
    id: string;
    brandName: string;
    genericName: string;
    strength: string;
    packSize: string;
  };
  customer: {
    name: string;
    phone: string | null;
    phoneVerified: boolean;
    noShowCount: number;
  };
}

interface ListResponse {
  reservations: Reservation[];
}

interface DeclineResponse {
  reservation: Reservation;
  markedOutOfStock: boolean;
}

const TABS: {
  key: TabKey;
  scope: Scope;
  labelKey: 'tabNew' | 'tabActive';
  emptyKey: 'emptyNew' | 'emptyActive';
  hintKey: 'emptyNewHint' | 'emptyActiveHint';
}[] = [
  { key: 'new',    scope: 'pending',   labelKey: 'tabNew',    emptyKey: 'emptyNew',    hintKey: 'emptyNewHint' },
  { key: 'active', scope: 'confirmed', labelKey: 'tabActive', emptyKey: 'emptyActive', hintKey: 'emptyActiveHint' },
];

export default function ReservationsPage() {
  const auth = useAuthGuard();
  const t = useTranslations('reservations');
  const tCommon = useTranslations('common');
  const [tab, setTab] = useState<TabKey>('new');
  const [confirming, setConfirming] = useState<Reservation | null>(null);
  const [declining, setDeclining] = useState<Reservation | null>(null);

  const currentTab = TABS.find((x) => x.key === tab) ?? TABS[0];

  const query = useQuery({
    queryKey: ['reservations', currentTab.scope],
    queryFn: () =>
      api<ListResponse>(`/v1/pharmacy/reservations?scope=${currentTab.scope}&limit=50`),
    enabled: auth.status === 'verified',
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  if (auth.status !== 'verified') return null;

  const items = query.data?.ok ? query.data.data.reservations : [];

  return (
    <AppShell>
      <h1 className="text-lg font-semibold mb-4">{t('title')}</h1>

      <div className="border-b mb-4">
        <div role="tablist" className="flex gap-1">
          {TABS.map((tb) => {
            const active = tb.key === tab;
            return (
              <button
                key={tb.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                  active
                    ? 'border-brand-600 text-brand-700 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {t(tb.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {query.isLoading && (
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      )}

      {query.data && !query.data.ok && (
        <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-3">
          {errorMessage(query.data.error)}
        </div>
      )}

      {query.data?.ok && items.length === 0 && (
        <div className="text-sm text-gray-500">
          <p className="font-medium">{t(currentTab.emptyKey)}</p>
          <p className="text-xs mt-1">{t(currentTab.hintKey)}</p>
        </div>
      )}

      {query.data?.ok && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((r) => (
            <ReservationCard
              key={r.id}
              reservation={r}
              onConfirm={r.status === 'requested' ? () => setConfirming(r) : undefined}
              onDecline={() => setDeclining(r)}
            />
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          reservation={confirming}
          onClose={() => setConfirming(null)}
        />
      )}

      {declining && (
        <DeclineDialog
          reservation={declining}
          onClose={() => setDeclining(null)}
        />
      )}
    </AppShell>
  );
}

function ReservationCard({
  reservation: r,
  onConfirm,
  onDecline,
}: {
  reservation: Reservation;
  onConfirm?: () => void;
  onDecline: () => void;
}) {
  const t = useTranslations('reservations');

  const deadline = r.status === 'requested' ? r.respondBy : r.pickupBy;
  const isPending = r.status === 'requested';

  const deadlineLabel = deadline
    ? isPending
      ? t('respondBy', { time: formatTime(deadline) })
      : t('pickupBy', { time: formatTime(deadline) })
    : '';

  const countdown = deadline ? relativeTo(deadline) : null;

  const countdownText = countdown
    ? countdown.overdue
      ? t(isPending ? 'respondOverdue' : 'pickupOverdue')
      : countdown.hours >= 1
        ? t('respondInHours', { hours: countdown.hours })
        : t('respondIn', { minutes: countdown.minutes })
    : null;

  return (
    <li className="bg-white rounded-lg border p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {r.medicine.brandName}
            {r.requiresPrescription && (
              <span className="ml-2 inline-block text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                {t('rxRequired')}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {r.medicine.genericName} · {r.medicine.strength} · {r.medicine.packSize}
          </div>
        </div>
        <div className="text-sm font-medium shrink-0">{t('qty', { count: r.qty })}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <div>
          <span className="font-medium">{r.customer.name}</span>
          {r.customer.phone && <span className="ml-2">{r.customer.phone}</span>}
        </div>
        {deadline && (
          <div className={countdown?.overdue ? 'text-danger-600 font-medium' : ''}>
            {deadlineLabel}
            {countdownText && <span className="ml-2">· {countdownText}</span>}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {t('confirmButton')}
          </button>
        )}
        <button
          type="button"
          onClick={onDecline}
          className="text-xs px-3 py-1.5 rounded border border-danger-500 text-danger-600 hover:bg-danger-50 focus:outline-none focus:ring-2 focus:ring-danger-500"
        >
          {t('declineButton')}
        </button>
      </div>
    </li>
  );
}

function ConfirmDialog({
  reservation,
  onClose,
}: {
  reservation: Reservation;
  onClose: () => void;
}) {
  const t = useTranslations('reservations');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [holdMinutes, setHoldMinutes] = useState(120);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickupUntil = new Date(Date.now() + holdMinutes * 60_000);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitting, onClose]);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);

    const result = await api(`/v1/pharmacy/reservations/${reservation.id}/confirm`, {
      method: 'POST',
      body: { holdMinutes },
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.error.kind === 'conflict') {
        const code = result.error.code;
        if (code === 'RESPONSE_WINDOW_PASSED') {
          setError(t('confirmErrorResponsePassed'));
        } else if (code === 'INVALID_STATE') {
          setError(t('confirmErrorInvalidState'));
        } else {
          setError(errorMessage(result.error));
        }
      } else if (result.error.kind === 'forbidden') {
        setError(t('confirmErrorNotVerified'));
      } else {
        setError(errorMessage(result.error));
      }
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reservations'] }),
      queryClient.invalidateQueries({ queryKey: ['reservations-summary'] }),
    ]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {t('confirmTitle')}
        </h2>

        <p className="text-sm font-medium text-gray-800">
          {reservation.medicine.brandName} · {reservation.medicine.strength}
        </p>
        <p className="text-sm text-gray-600">
          {reservation.customer.name} · {t('qty', { count: reservation.qty })}
        </p>

        <label className="block">
          <span className="text-sm font-medium">{t('pickupWindowLabel')}</span>
          <select
            value={holdMinutes}
            onChange={(e) => setHoldMinutes(Number(e.target.value))}
            disabled={submitting}
            autoFocus
            className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
          >
            <option value={30}>{t('pickupDuration30m')}</option>
            <option value={60}>{t('pickupDuration1h')}</option>
            <option value={90}>{t('pickupDuration90m')}</option>
            <option value={120}>{t('pickupDuration2h')}</option>
            <option value={180}>{t('pickupDuration3h')}</option>
            <option value={240}>{t('pickupDuration4h')}</option>
          </select>
        </label>

        <p className="text-xs text-gray-500">
          {t('pickupWindowUntil', { time: formatTime(pickupUntil.toISOString()) })}
        </p>

        {error && (
          <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t('confirming') : t('confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeclineDialog({
  reservation,
  onClose,
}: {
  reservation: Reservation;
  onClose: () => void;
}) {
  const t = useTranslations('reservations');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [reason, setReason] = useState<'out_of_stock' | 'closed' | 'other'>('out_of_stock');
  const [note, setNote] = useState('');
  const [alsoMarkOutOfStock, setAlsoMarkOutOfStock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitting, onClose]);

  const onSubmit = async () => {
    setError(null);

    if (reason === 'other' && note.trim().length < 3) {
      setError(t('declineErrorNoteRequired'));
      return;
    }

    const body: {
      reason: string;
      note?: string;
      alsoMarkOutOfStock?: boolean;
    } = { reason };

    if (reason === 'other') {
      body.note = note.trim();
    } else if (reason === 'out_of_stock') {
      if (!alsoMarkOutOfStock) body.alsoMarkOutOfStock = false;
    }

    setSubmitting(true);
    const result = await api<DeclineResponse>(
      `/v1/pharmacy/reservations/${reservation.id}/decline`,
      { method: 'POST', body },
    );
    setSubmitting(false);

    if (!result.ok) {
      if (result.error.kind === 'conflict' && result.error.code === 'INVALID_STATE') {
        setError(t('declineErrorInvalidState'));
      } else if (result.error.kind === 'validation' && result.error.fields.note) {
        setError(result.error.fields.note);
      } else {
        setError(errorMessage(result.error));
      }
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
      return;
    }

    const invalidations: Promise<unknown>[] = [
      queryClient.invalidateQueries({ queryKey: ['reservations'] }),
      queryClient.invalidateQueries({ queryKey: ['reservations-summary'] }),
    ];
    if (result.data.markedOutOfStock) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: ['stock'] }));
    }
    await Promise.all(invalidations);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decline-dialog-title"
        className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4"
      >
        <h2 id="decline-dialog-title" className="text-lg font-semibold">
          {t('declineTitle')}
        </h2>

        <p className="text-sm font-medium text-gray-800">
          {reservation.medicine.brandName} · {reservation.medicine.strength}
        </p>
        <p className="text-sm text-gray-600">
          {reservation.customer.name} · {t('qty', { count: reservation.qty })}
        </p>

        <label className="block">
          <span className="text-sm font-medium">{t('declineReasonLabel')}</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            disabled={submitting}
            autoFocus
            className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
          >
            <option value="out_of_stock">{t('declineReasonOutOfStock')}</option>
            <option value="closed">{t('declineReasonClosed')}</option>
            <option value="other">{t('declineReasonOther')}</option>
          </select>
        </label>

        {reason === 'other' && (
          <label className="block">
            <span className="text-sm font-medium">{t('declineNoteLabel')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              rows={3}
              className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
            />
            <span className="text-xs text-gray-500 mt-1 block">
              {t('declineNoteHint')}
            </span>
          </label>
        )}

        {reason === 'out_of_stock' && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={alsoMarkOutOfStock}
              onChange={(e) => setAlsoMarkOutOfStock(e.target.checked)}
              disabled={submitting}
              className="mt-1 rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
            />
            <span>
              <span className="text-sm font-medium block">
                {t('declineAlsoMarkOutOfStock')}
              </span>
              <span className="text-xs text-gray-500 block">
                {t('declineAlsoMarkOutOfStockHint')}
              </span>
            </span>
          </label>
        )}

        {error && (
          <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="text-sm px-3 py-1.5 rounded bg-danger-600 text-white hover:bg-danger-500 disabled:opacity-50"
          >
            {submitting ? t('declining') : t('declineConfirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTo(iso: string): { overdue: boolean; minutes: number; hours: number } {
  const diffMs = new Date(iso).getTime() - Date.now();
  const overdue = diffMs < 0;
  const totalMinutes = Math.abs(Math.round(diffMs / 60_000));
  return { overdue, minutes: totalMinutes, hours: Math.round(totalMinutes / 60) };
}