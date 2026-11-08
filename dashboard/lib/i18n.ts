export const locales = ['en', 'am'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'am';
}

/**
 * Accepts either a raw document.cookie string (client) or a Cookie header (server).
 * getInitialProps receives both forms depending on where it runs.
 */
export function getLocaleFromCookieHeader(
  cookieHeader: string | undefined,
): Locale {
  if (!cookieHeader) return defaultLocale;
  const match = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/);
  const val = match?.[1];
  return isLocale(val) ? val : defaultLocale;
}

export function setLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export async function loadMessages(
  locale: Locale,
): Promise<Record<string, unknown>> {
  return (await import(`../messages/${locale}.json`)).default;
}

/** Lighter version for the CI parity script. */
export async function getAllKeys(locale: Locale): Promise<string[]> {
  const messages = await loadMessages(locale);
  const keys: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') walk(v as Record<string, unknown>, full);
      else keys.push(full);
    }
  };
  walk(messages, '');
  return keys.sort();
}