import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeolocation, ADDIS_CENTER } from '@/lib/useGeolocation';

describe('useGeolocation', () => {
  beforeEach(() => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('falls back to Addis center when the browser has no geolocation API', async () => {
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.coords).toEqual(ADDIS_CENTER);
    expect(result.current.isFallback).toBe(true);
  });

  it('returns real coordinates when the user grants permission', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 9.03, longitude: 38.8 } }),
    );
    Object.defineProperty(global.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status).toBe('granted'));
    expect(result.current.coords).toEqual({ lat: 9.03, lng: 38.8 });
    expect(result.current.isFallback).toBe(false);
  });

  it('falls back to Addis center when the user denies permission', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error({ code: 1 }));
    Object.defineProperty(global.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.coords).toEqual(ADDIS_CENTER);
    expect(result.current.isFallback).toBe(true);
  });
});