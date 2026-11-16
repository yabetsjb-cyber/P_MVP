import { useState } from 'react';
import { ArrowLeft, Minus, Plus, CheckCircle2, X, Phone } from 'lucide-react';
import { useReserve } from '@/lib/useReserve';
import { useAuth } from '@/context/AuthContext';
import type { PharmacyMedicine, SearchPharmacy } from '@/lib/useSearch';

interface ReserveModalProps {
  pharmacy: SearchPharmacy;
  medicine: PharmacyMedicine;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
}

export function ReserveModal({
  pharmacy,
  medicine,
  onClose,
  onSuccess,
}: ReserveModalProps) {
  const { customer } = useAuth();
  const [qty, setQty] = useState(1);
  const [stage, setStage] = useState<'form' | 'success'>('form');
  const [reservation, setReservation] = useState<ReturnType<typeof useReserve>['data']>(undefined);

  const reserve = useReserve();
  const errorMessage =
    reserve.error && typeof reserve.error === 'object' && 'kind' in reserve.error
      ? mapError(reserve.error)
      : null;

  const canDecrease = qty > 1;
  const canIncrease = qty < medicine.maxReservable;

  const handleSubmit = async () => {
    try {
      const created = await reserve.mutateAsync({
        inventoryId: medicine.inventoryId,
        qty,
      });
      setReservation(created);
      setStage('success');
    } catch {
      // error is surfaced via reserve.error
    }
  };

  if (stage === 'success' && reservation) {
    return (
      <SuccessScreen
        reservation={reservation}
        fallbackPhone={customer?.phone ?? null}
        onDone={onClose}
        onViewAll={() => onSuccess(reservation.id)}
      />
    );
  }

    return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-dialog-title"
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-float max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white pt-3 pb-2 z-10">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" aria-hidden />
        </div>

        <div className="px-5 pb-6">
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close reserve dialog"
              className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 id="reserve-dialog-title" className="text-lg font-bold text-gray-900">Reserve medicine</h2>          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-5">
            <div className="font-semibold text-gray-900">
              {medicine.brandName} · {medicine.strength}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {medicine.genericName} · {medicine.packSize}
            </div>
            <div className="text-xs text-gray-600 mt-2">
              {pharmacy.name} · {formatDistance(pharmacy.distanceMeters)}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity
            </label>
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-2">
              <button
                type="button"
                onClick={() => canDecrease && setQty(qty - 1)}
                disabled={!canDecrease}
                aria-label="Decrease quantity"
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Minus size={16} />
              </button>
              <span
                aria-live="polite"
                className="text-xl font-bold text-gray-900"
              >
                {qty}
              </span>
              <button
                type="button"
                onClick={() => canIncrease && setQty(qty + 1)}
                disabled={!canIncrease}
                aria-label="Increase quantity"
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Plus size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {medicine.maxReservable} available to reserve
            </p>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pickup will be confirmed by the pharmacy
            </label>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-600">
              <Phone size={14} className="shrink-0 text-gray-400" />
              <span className="truncate">
                {customer?.phone ?? 'No phone on your account'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              We'll send your pickup code to this number once the pharmacy
              confirms. Show the code at the counter to collect your medicine.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3 mb-4"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={reserve.isPending || !customer?.phone}
            className="w-full py-3 rounded-xl bg-accent-400 text-brand-700 font-semibold hover:bg-accent-500 disabled:opacity-50 disabled:pointer-events-none"
          >
            {reserve.isPending ? 'Reserving…' : 'Confirm reservation'}
          </button>

          {!customer?.phone && (
            <p className="text-xs text-danger-600 mt-2 text-center">
              A phone number is required to receive your pickup code.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({
  reservation,
  fallbackPhone,
  onDone,
  onViewAll,
}: {
  reservation: NonNullable<ReturnType<typeof useReserve>['data']>;
  fallbackPhone: string | null;
  onDone: () => void;
  onViewAll: () => void;
}) {
    return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-success-title"
      className="fixed inset-0 z-50 bg-white flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 mb-4">
          <CheckCircle2 className="w-8 h-8 text-success-600" />
        </div>
                <h2 id="reserve-success-title" className="text-2xl font-bold text-gray-900 mb-2">Reserved!</h2>
        <p className="text-sm text-gray-600 mb-6">
          Your reservation has been sent to {reservation.pharmacy.name}.
        </p>

        {reservation.code ? (
          <>
            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
              Your pickup code
            </p>
            <div className="bg-brand-50 border-2 border-brand-600 rounded-2xl py-5 px-6 mb-4">
              <div className="text-4xl font-mono font-bold tracking-widest text-brand-700">
                {reservation.code}
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-6">
              We've also sent this code to {fallbackPhone ?? 'your phone'} by SMS.
              Show it at the pharmacy counter to pick up your medicine.
            </p>
          </>
        ) : (
          <>
            <div className="bg-brand-50 border-2 border-brand-600 rounded-2xl py-5 px-6 mb-4">
              <p className="text-sm font-medium text-brand-700">
                We've sent your pickup code by SMS
              </p>
              {fallbackPhone && (
                <p className="text-xs text-brand-600 mt-1">{fallbackPhone}</p>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-6">
              Show the SMS at the pharmacy counter to collect your medicine.
            </p>
          </>
        )}

        {reservation.pickupBy && (
          <p className="text-sm text-gray-700 mb-6">
            Pick up by{' '}
            <span className="font-semibold">
              {new Date(reservation.pickupBy).toLocaleString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: 'short',
              })}
            </span>
          </p>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={onViewAll}
            className="w-full py-3 rounded-xl bg-accent-400 text-brand-700 font-semibold hover:bg-accent-500"
          >
            View all reservations
          </button>
          <button
            type="button"
            onClick={onDone}
            className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function mapError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Could not create reservation.';
  const e = error as { kind: string; message?: string; code?: string };
  if (e.kind === 'network') return 'You appear to be offline. Check your connection.';
  if (e.kind === 'unauthorized') return 'Your session expired. Please log in again.';
  if (e.kind === 'conflict') {
    if (e.code === 'OUT_OF_STOCK') return 'This medicine just went out of stock. Try another pharmacy.';
    if (e.code === 'ALREADY_RESERVED') return 'You already have a reservation for this medicine here.';
    if (e.code === 'ACCOUNT_SUSPENDED') return 'Your account is suspended. Contact support.';
    if (e.code === 'QUANTITY_UNAVAILABLE') return 'Not enough stock. Try a smaller quantity.';
    return 'Could not reserve. Try again.';
  }
  if (e.kind === 'validation') return 'Please check the quantity.';
  return e.message ?? 'Could not create reservation.';
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}