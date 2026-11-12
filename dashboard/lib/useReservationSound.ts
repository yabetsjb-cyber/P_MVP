import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'medfinder.soundEnabled';

// One shared AudioContext per page. Browsers limit the number of concurrent
// contexts (typically 6), so create it lazily and cache it.
let cachedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (cachedContext) return cachedContext;
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedContext = new Ctor() as AudioContext;
    return cachedContext;
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 880;

  // Short attack, sustain, exponential release to avoid clicks.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain.gain.setValueAtTime(0.3, now + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.31);
}

/**
 * Plays a short tone when `count` increases, but not:
 * - on the very first data arrival (initial load of existing reservations)
 * - on a decrease (the pharmacist already handled some)
 * - when the sound is disabled
 *
 * `dataReady` distinguishes "no data yet" (count is a placeholder 0)
 * from "no new reservations" (count is genuinely 0).
 */
export function useReservationSound(count: number, dataReady: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const prevCountRef = useRef<number | undefined>(undefined);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasAudio = !!(
      (window as any).AudioContext || (window as any).webkitAudioContext
    );
    setSupported(hasAudio);

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setEnabled(true);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(next));
        if (next) {
          // Unlock the context on the user gesture — required by browsers.
          const ctx = getAudioContext();
          if (ctx && ctx.state === 'suspended') {
            void ctx.resume();
          }
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!dataReady) return;

    // First time data arrives — record the count without playing.
    if (!wasReadyRef.current) {
      wasReadyRef.current = true;
      prevCountRef.current = count;
      return;
    }

    const prev = prevCountRef.current;
    prevCountRef.current = count;

    if (!enabled) return;
    if (prev === undefined) return;
    if (count <= prev) return;

    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(ctx);
  }, [count, dataReady, enabled]);

  return { enabled, toggle, supported };
}