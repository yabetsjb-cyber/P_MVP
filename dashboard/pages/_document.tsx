import { Html, Head, Main, NextScript } from 'next/document';
import type { DocumentContext } from 'next/document';
import { getLocaleFromCookieHeader } from '@/lib/i18n';

export default function Document({ locale }: { locale: string }) {
  return (
    <Html lang={locale}>
      <Head>
          <title>MedFinder</title>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+Ethiopic:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body className="bg-gray-50 antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

Document.getInitialProps = async (ctx: DocumentContext) => {
  const initialProps = await ctx.defaultGetInitialProps(ctx);
  const locale = getLocaleFromCookieHeader(ctx.req?.headers.cookie);
  return { ...initialProps, locale };
};