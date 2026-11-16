import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SearchPharmacy {
  pharmacyId: string;
  inventoryId: string;
  name: string;
  address: string | null;
  subcity: string | null;
  phone: string | null;
  openingHours: unknown;
  lat: number;
  lng: number;
  distanceMeters: number;
  stockLevel: 'low' | 'ok';
  maxReservable: number;
  updatedAt: string;
  freshness: string;
}

export interface SearchMedicine {
  id: string;
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  packSize: string;
  rxStatus: 'RX' | 'OTC';
  requiresPrescription: boolean;
  pharmacies: SearchPharmacy[];
  moreNearby: number;
}

export interface SearchResponse {
  query: { text: string; strength: string | null };
  searchedRadiusMeters: number;
  canWiden: boolean;
  notice: { code: string; message: string } | null;
  medicines: SearchMedicine[];
  unavailable: Array<{
    id: string;
    brandName: string;
    genericName: string;
    strength: string;
  }>;
}

interface UseSearchOptions {
  query: string;
  lat: number;
  lng: number;
  radiusM?: number;
}

export interface PharmacyMedicine {
  medicineId: string;
  brandName: string;
  genericName: string;
  strength: string;
  packSize: string;
  requiresPrescription: boolean;
  inventoryId: string;
  maxReservable: number;
  stockLevel: 'low' | 'ok';
}

export interface PharmacyWithMedicines {
  pharmacy: SearchPharmacy;
  medicines: PharmacyMedicine[];
}

export function useSearch({ query, lat, lng, radiusM = 5000 }: UseSearchOptions) {
  return useQuery({
    queryKey: ['public-search', query, lat, lng, radiusM],
    queryFn: () =>
      api<SearchResponse>(
        `/v1/search?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}&radius_m=${radiusM}`,
      ),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  });
}