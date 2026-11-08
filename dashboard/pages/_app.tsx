import '@/styles/globals.css';
import type { AppContext, AppProps } from 'next/app';
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import Head from 'next/head';


import { makeQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import {
  type Locale,
  getLocaleFromCookieHeader,
  loadMessages,
} from '@/lib/i18n';

type CustomProps = AppProps & {
  initialLocale: Locale;
  initialMessages: Record<string, unknown>;
};

function App({ Component, pageProps, initialLocale, initialMessages }: CustomProps) {
  const [queryClient] = useState(() => makeQueryClient());
      return (
    <>
      <Head>
        <title>MedFinder</title>
      </Head>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider initialLocale={initialLocale} initialMessages={initialMessages}>
          <AuthProvider>
            <Component {...pageProps} />
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </>
  );
}

App.getInitialProps = async (appContext: AppContext) => {
  let pageProps: Record<string, unknown> = {};
  if (appContext.Component.getInitialProps) {
    pageProps = await appContext.Component.getInitialProps(appContext.ctx);
  }

  const cookieHeader =
    typeof window === 'undefined'
      ? appContext.ctx.req?.headers.cookie
      : document.cookie;

  const initialLocale = getLocaleFromCookieHeader(cookieHeader);
  const initialMessages = await loadMessages(initialLocale);

  return { pageProps, initialLocale, initialMessages };
};

export default App;