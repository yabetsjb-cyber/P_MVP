import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Reservation {
  id: string;
  code?: string | null;
  status: 'requested' | 'confirmed' | 'fulfilled' | 'cancelled' | 'expired';
  qty: number;
  respondBy: string;
  pickupBy: string | null;
  createdAt: string;
  medicine: {
    brandName: string;
    genericName: string;
    strength: string;
    packSize: string;
  };
  pharmacy: {
    name: string;
    address: string | null;
    subcity: string | null;
    phone: string | null;
  };
}

export interface CreateReservationResponse {
  reservation: Reservation;
}

export function useReserve() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { inventoryId: string; qty: number }) => {
      const res = await api<CreateReservationResponse>(
        '/v1/customer/reservations',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) throw res.error;
      return res.data.reservation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-reservations'] });
    },
  });
}