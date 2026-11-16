import { ReactNode } from 'react';
import Head from 'next/head';
import { BottomNav } from './BottomNav';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        <title>MedFinder</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0A3832" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <main className="min-h-screen pb-20 max-w-md mx-auto bg-surface shadow-2xl overflow-hidden relative">
        {children}
      </main>
      <BottomNav />
    </>
  );
}