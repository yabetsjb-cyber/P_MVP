import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReservationSound } from '@/lib/useReservationSound';
import { resetOscillatorCount, getOscillatorCount } from '../mocks/audio';

describe('useReservationSound', () => {
  beforeEach(() => {
    resetOscillatorCount();
    window.localStorage.clear();
  });

  it('does not play when disabled (default state)', () => {
    const { rerender } = renderHook(
      ({ count, ready }) => useReservationSound(count, ready),
      { initialProps: { count: 0, ready: false } },
    );

    rerender({ count: 0, ready: true });
    rerender({ count: 2, ready: true });
    rerender({ count: 3, ready: true });

    expect(getOscillatorCount()).toBe(0);
  });

  it('toggle sets localStorage and flips enabled state', async () => {
    const { result } = renderHook(() => useReservationSound(0, false));

    expect(result.current.enabled).toBe(false);

    act(() => {
      result.current.toggle();
    });

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(window.localStorage.getItem('medfinder.soundEnabled')).toBe('true');

    act(() => {
      result.current.toggle();
    });

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(window.localStorage.getItem('medfinder.soundEnabled')).toBe('false');
  });

  it('hydrates enabled=true from localStorage on mount', async () => {
    window.localStorage.setItem('medfinder.soundEnabled', 'true');

    const { result } = renderHook(() => useReservationSound(0, false));

    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it('plays a tone when enabled and count increases', async () => {
    const { result, rerender } = renderHook(
      ({ count, ready }) => useReservationSound(count, ready),
      { initialProps: { count: 2, ready: true } },
    );

    act(() => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    rerender({ count: 3, ready: true });

    expect(getOscillatorCount()).toBe(1);
  });

  it('does not play on count decrease', async () => {
    const { result, rerender } = renderHook(
      ({ count, ready }) => useReservationSound(count, ready),
      { initialProps: { count: 3, ready: true } },
    );

    act(() => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    rerender({ count: 1, ready: true });

    expect(getOscillatorCount()).toBe(0);
  });

  it('does not play on initial data arrival even when enabled', async () => {
    window.localStorage.setItem('medfinder.soundEnabled', 'true');

    const { result, rerender } = renderHook(
      ({ count, ready }) => useReservationSound(count, ready),
      { initialProps: { count: 0, ready: false } },
    );

    await waitFor(() => expect(result.current.enabled).toBe(true));

    rerender({ count: 2, ready: true });

    expect(getOscillatorCount()).toBe(0);
  });
});