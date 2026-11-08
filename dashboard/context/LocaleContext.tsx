import { createContext, useContext, useState, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { loadMessages, setLocaleCookie } from '@/lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
}

type IntlMessages = { [key: string]: string | IntlMessages };

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: Locale;
  initialMessages: Record<string, unknown>;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState(initialMessages);

  const setLocale = async (next: Locale) => {
    if (next === locale) return;
    const nextMessages = await loadMessages(next);
    setLocaleCookie(next);
    setLocaleState(next);
    setMessages(nextMessages);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages as IntlMessages}
        timeZone="Africa/Addis_Ababa"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}