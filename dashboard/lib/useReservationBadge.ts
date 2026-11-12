import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Summary {
  requested: number;
  confirmed: number;
  nextRespondBy: string | null;
  serverTime: string;
}

/**
 * Polls the pharmacy's reservation summary every 10 seconds while the tab
 * is visible, and returns the count of "requested" (unhandled) reservations.
 *
 * When `enabled` is false the query does not run (unauthenticated, or
 * the pharmacy is not verified yet).
 */
export function useReservationBadge(enabled: boolean) {
  const query = useQuery({
    queryKey: ['reservations-summary'],
    queryFn: () => api<Summary>('/v1/pharmacy/reservations/summary'),
    enabled,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const count = query.data?.ok ? query.data.data.requested : 0;

  // Update the tab title so a pharmacist on another tab sees the count.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (count > 0) {
      document.title = `(${count > 99 ? '99+' : count}) MedFinder`;
    } else {
      document.title = 'MedFinder';
    }
  }, [count]);

  return { count, query };
}