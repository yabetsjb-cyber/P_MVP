import { ArrowLeft, MapPin, Phone, Clock, Pill, ChevronRight } from 'lucide-react';
import type { PharmacyWithMedicines, PharmacyMedicine } from '@/lib/useSearch';

interface PharmacyDetailProps {
  data: PharmacyWithMedicines;
  onBack: () => void;
  onReserve: (medicine: PharmacyMedicine) => void;
}

export function PharmacyDetail({ data, onBack, onReserve }: PharmacyDetailProps) {
  const { pharmacy, medicines } = data;

  return (
    <div className="absolute bottom-16 left-0 right-0 z-10 bg-white rounded-t-3xl shadow-float border-t border-gray-100 max-h-[70vh] overflow-y-auto">
      <div className="sticky top-0 bg-white pt-3 pb-2 z-10">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" aria-hidden />
      </div>

      <div className="px-5 pb-6">
        <div className="flex items-start gap-3 mb-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to results"
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {pharmacy.name}
            </h2>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 flex-wrap">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">
                {pharmacy.address || pharmacy.subcity || 'Address not listed'}
              </span>
              <span>·</span>
              <span>{formatDistance(pharmacy.distanceMeters)}</span>
            </div>
          </div>
        </div>

        {pharmacy.phone && (
          <a
            href={`tel:${pharmacy.phone}`}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 mb-4"
          >
            <Phone size={16} />
            Call {pharmacy.phone}
          </a>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-md">
            <Clock size={12} />
            {pharmacy.freshness}
          </span>
          {pharmacy.stockLevel === 'low' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-warning-700 bg-warning-50 px-2 py-1 rounded-md font-medium">
              Low stock
            </span>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            {medicines.length} {medicines.length === 1 ? 'medicine' : 'medicines'} in stock
          </h3>
          <ul className="space-y-2">
            {medicines.map((m) => (
              <li
                key={m.inventoryId}
                className="border border-gray-100 rounded-xl p-3"
              >
                <div className="min-w-0 mb-2">
                  <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5 flex-wrap">
                    {m.brandName}
                    {m.requiresPrescription && (
                      <span className="text-xs bg-warning-50 text-warning-700 px-1.5 py-0.5 rounded font-medium">
                        Rx
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Pill size={10} className="shrink-0" />
                    {m.genericName} · {m.strength} · {m.packSize}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {m.maxReservable} available to reserve
                  </span>
                  <button
                    type="button"
                    onClick={() => onReserve(m)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-accent-400 text-brand-700 rounded-lg hover:bg-accent-500 active:bg-accent-500"
                  >
                    Reserve
                    <ChevronRight size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}