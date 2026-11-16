import { MapPin, Pill, AlertCircle, Search as SearchIcon } from 'lucide-react';
import type { SearchPharmacy } from '@/lib/useSearch';
import type { ApiError } from '@/lib/api';

export interface PharmacyWithMedicines {
  pharmacy: SearchPharmacy;
  medicines: Array<{ brandName: string; strength: string; packSize: string }>;
}

interface PharmacySheetProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  pharmacies: PharmacyWithMedicines[];
  restricted: boolean;
  error: ApiError | null;
  selectedId: string | null;
  onSelect: (pharmacyId: string) => void;
  unavailableCount: number;
}

export function PharmacySheet({
  status,
  pharmacies,
  restricted,
  error,
  selectedId,
  onSelect,
  unavailableCount,
}: PharmacySheetProps) {
  return (
    <div className="absolute bottom-16 left-0 right-0 z-10 bg-white rounded-t-3xl shadow-float border-t border-gray-100 max-h-[55vh] overflow-y-auto">
      <div className="sticky top-0 bg-white pt-3 pb-2 z-10">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" aria-hidden />
      </div>

      <div className="px-5 pb-6">
        {status === 'idle' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 mb-3">
              <SearchIcon className="w-6 h-6 text-brand-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">Search for a medicine</p>
            <p className="text-xs text-gray-500 mt-1">
              Nearby pharmacies with stock will appear here.
            </p>
          </div>
        )}

        {status === 'loading' && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-xs text-gray-500 mt-3">Looking for stock nearby…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-danger-50 mb-3">
              <AlertCircle className="w-6 h-6 text-danger-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">Search failed</p>
            <p className="text-xs text-gray-500 mt-1">
              {error?.kind === 'network'
                ? 'You appear to be offline. Check your connection.'
                : 'Something went wrong. Try again.'}
            </p>
          </div>
        )}

        {status === 'success' && restricted && (
          <div className="bg-warning-50 rounded-xl p-3 mb-3 border border-warning-200">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-warning-600 shrink-0 mt-0.5" />
              <p className="text-xs text-warning-800">
                This medicine is not listed online. Please ask a pharmacy directly.
              </p>
            </div>
          </div>
        )}

        {status === 'success' && pharmacies.length === 0 && !restricted && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-warning-50 mb-3">
              <MapPin className="w-6 h-6 text-warning-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">No nearby stock</p>
            <p className="text-xs text-gray-500 mt-1">
              No verified pharmacy within 5 km has this medicine.
            </p>
            {unavailableCount > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {unavailableCount} similar{' '}
                {unavailableCount === 1 ? 'medicine' : 'medicines'} found but out of stock
                nearby.
              </p>
            )}
          </div>
        )}

        {status === 'success' && pharmacies.length > 0 && (
          <>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              {pharmacies.length} {pharmacies.length === 1 ? 'pharmacy' : 'pharmacies'} nearby
            </p>
            <ul className="space-y-2">
              {pharmacies.map(({ pharmacy, medicines }) => {
                const selected = pharmacy.pharmacyId === selectedId;
                return (
                  <li key={pharmacy.pharmacyId}>
                    <button
                      type="button"
                      onClick={() => onSelect(pharmacy.pharmacyId)}
                      className={`w-full text-left rounded-xl p-3 border transition-colors ${
                        selected
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-sm text-gray-900 truncate">
                          {pharmacy.name}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {formatDistance(pharmacy.distanceMeters)}
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-gray-500 mb-2">
                        <MapPin size={12} className="shrink-0 mt-0.5" />
                        <span className="truncate">
                          {pharmacy.address || pharmacy.subcity || '—'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {medicines.map((m, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-100 rounded-md px-1.5 py-0.5"
                          >
                            <Pill size={10} className="text-brand-600" />
                            {m.brandName} {m.strength}
                          </span>
                        ))}
                      </div>
                      {pharmacy.stockLevel === 'low' && (
                        <span className="inline-block mt-2 text-xs bg-warning-50 text-warning-700 px-2 py-0.5 rounded-md font-medium">
                          Low stock
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}