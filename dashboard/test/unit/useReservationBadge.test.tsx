import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useReservationBadge } from '@/lib/useReservationBadge';
import { makeQueryClient } from '@/lib/queryClient';
import { server } from '../mocks/server';

const API = 'http://localhost:3000';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = makeQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useReservationBadge', () => {
  it('returns the requested count from the summary endpoint', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/reservations/summary`, () =>
        HttpResponse.json({
          requested: 5,
          confirmed: 2,
          nextRespondBy: null,
          serverTime: new Date().toISOString(),
        }),
      ),
    );

    const { result } = renderHook(() => useReservationBadge(true), { wrapper });

    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });
    expect(document.title).toBe('(5) MedFinder');
  });

  it('returns 0 and clears the title when count is 0', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/reservations/summary`, () =>
        HttpResponse.json({
          requested: 0,
          confirmed: 0,
          nextRespondBy: null,
          serverTime: new Date().toISOString(),
        }),
      ),
    );

    const { result } = renderHook(() => useReservationBadge(true), { wrapper });

    await waitFor(() => {
      expect(result.current.count).toBe(0);
    });
    expect(document.title).toBe('MedFinder');
  });

  it('does not poll when enabled is false', async () => {
    let called = false;
    server.use(
      http.get(`${API}/v1/pharmacy/reservations/summary`, () => {
        called = true;
        return HttpResponse.json({
          requested: 0,
          confirmed: 0,
          nextRespondBy: null,
          serverTime: new Date().toISOString(),
        });
      }),
    );

    const { result } = renderHook(() => useReservationBadge(false), { wrapper });

    await new Promise((r) => setTimeout(r, 100));
    expect(called).toBe(false);
    expect(result.current.count).toBe(0);
  });
});