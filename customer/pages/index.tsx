import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { useGeolocation } from '@/lib/useGeolocation';
import {
  useSearch,
  type PharmacyWithMedicines,
  type PharmacyMedicine,
} from '@/lib/useSearch';
import { Layout } from '@/components/Layout';
import { SearchBar } from '@/components/SearchBar';
import { PharmacySheet } from '@/components/PharmacySheet';
import { PharmacyDetail } from '@/components/PharmacyDetail';

const MapView = dynamic(
  () => import('@/components/MapView').then((m) => m.MapView),
  { ssr: false, loading: () => <div className="w-full h-full bg-gray-100" /> },
);

export default function HomePage() {
  const { coords, isFallback } = useGeolocation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState(coords);
  const [viewMode, setViewMode] = useState<'results' | 'detail'>('results');
  const [reserveNotice, setReserveNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setMapCenter(coords);
  }, [coords.lat, coords.lng]);

  // Reset to results view whenever the search query changes.
  useEffect(() => {
    setViewMode('results');
    setSelectedId(null);
    setReserveNotice(null);
  }, [debounced]);

  const search = useSearch({ query: debounced, lat: coords.lat, lng: coords.lng });

  const pharmacies = useMemo<PharmacyWithMedicines[]>(() => {
    if (!search.data?.ok) return [];
    const byPharmacy = new Map<string, PharmacyWithMedicines>();
    for (const med of search.data.data.medicines) {
      for (const ph of med.pharmacies) {
        const entry: PharmacyMedicine = {
          medicineId: med.id,
          brandName: med.brandName,
          genericName: med.genericName,
          strength: med.strength,
          packSize: med.packSize,
          requiresPrescription: med.requiresPrescription,
          inventoryId: ph.inventoryId,
          maxReservable: ph.maxReservable,
          stockLevel: ph.stockLevel,
        };
        const existing = byPharmacy.get(ph.pharmacyId);
        if (existing) {
          existing.medicines.push(entry);
        } else {
          byPharmacy.set(ph.pharmacyId, { pharmacy: ph, medicines: [entry] });
        }
      }
    }
    return Array.from(byPharmacy.values()).sort(
      (a, b) => a.pharmacy.distanceMeters - b.pharmacy.distanceMeters,
    );
  }, [search.data]);

  const selectedPharmacy = useMemo(() => {
    if (!selectedId) return null;
    return pharmacies.find((p) => p.pharmacy.pharmacyId === selectedId) ?? null;
  }, [selectedId, pharmacies]);

  // If results disappear while in detail view, return to results.
  useEffect(() => {
    if (viewMode === 'detail' && !selectedPharmacy) {
      setViewMode('results');
      setReserveNotice(null);
    }
  }, [viewMode, selectedPharmacy]);

  const status: 'idle' | 'loading' | 'success' | 'error' =
    debounced.trim().length < 2
      ? 'idle'
      : search.isLoading
      ? 'loading'
      : search.data?.ok
      ? 'success'
      : search.data && !search.data.ok
      ? 'error'
      : 'idle';

  const restricted = search.data?.ok ? !!search.data.data.notice : false;
  const unavailableCount = search.data?.ok ? search.data.data.unavailable.length : 0;
  const error = search.data && !search.data.ok ? search.data.error : null;

  const handleSelect = (pharmacyId: string) => {
    setSelectedId(pharmacyId);
    const found = pharmacies.find((p) => p.pharmacy.pharmacyId === pharmacyId);
    if (found) {
      setMapCenter({ lat: found.pharmacy.lat, lng: found.pharmacy.lng });
      setViewMode('detail');
      setReserveNotice(null);
    }
  };

  const handleBack = () => {
    setViewMode('results');
    setReserveNotice(null);
  };

  const handleReserve = (medicine: PharmacyMedicine) => {
    setReserveNotice(
      `Reserve flow for ${medicine.brandName} ${medicine.strength} opens in the next step.`,
    );
  };

  return (
    <Layout>
      <div className="relative w-full h-[calc(100vh-5rem)] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <MapView
            center={mapCenter}
            pharmacies={pharmacies.map((p) => p.pharmacy)}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-6 pb-2 bg-gradient-to-b from-white via-white/95 to-transparent pointer-events-none">
          <div className="pointer-events-auto">
            <SearchBar value={query} onChange={setQuery} isLoading={search.isLoading} />
            {isFallback && (
              <p className="text-xs text-gray-500 mt-2 px-1">
                Showing results near Addis Ababa. Allow location for nearby pharmacies.
              </p>
            )}
          </div>
        </div>

        {viewMode === 'results' ? (
          <PharmacySheet
            status={status}
            pharmacies={pharmacies}
            restricted={restricted}
            error={error}
            selectedId={selectedId}
            onSelect={handleSelect}
            unavailableCount={unavailableCount}
          />
        ) : (
          selectedPharmacy && (
            <PharmacyDetail
              data={selectedPharmacy}
              onBack={handleBack}
              onReserve={handleReserve}
            />
          )
        )}

        {reserveNotice && (
          <div
            role="status"
            className="fixed bottom-24 left-4 right-4 z-50 max-w-md mx-auto"
          >
            <div className="bg-brand-600 text-white text-sm rounded-xl px-4 py-3 shadow-float flex items-start gap-2">
              <span className="flex-1">{reserveNotice}</span>
              <button
                type="button"
                onClick={() => setReserveNotice(null)}
                className="text-white/70 hover:text-white shrink-0"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}