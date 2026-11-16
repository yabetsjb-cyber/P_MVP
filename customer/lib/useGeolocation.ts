import { useEffect, useState } from 'react';

export const ADDIS_CENTER = { lat: 9.0107, lng: 38.7869 };

export type GeolocationStatus = 'prompting' | 'granted' | 'denied' | 'unavailable';

interface UseGeolocationResult {
  coords: { lat: number; lng: number };
  status: GeolocationStatus;
  /** True when using the Addis fallback rather than the real device location. */
  isFallback: boolean;
}

export function useGeolocation(): UseGeolocationResult {
  const [coords, setCoords] = useState(ADDIS_CENTER);
  const [status, setStatus] = useState<GeolocationStatus>('prompting');
  const [isFallback, setIsFallback] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setCoords(ADDIS_CENTER);
      setIsFallback(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setStatus('granted');
        setIsFallback(false);
      },
      () => {
        setStatus('denied');
        setCoords(ADDIS_CENTER);
        setIsFallback(true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  return { coords, status, isFallback };
}