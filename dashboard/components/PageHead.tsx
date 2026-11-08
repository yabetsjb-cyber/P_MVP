import Head from 'next/head';
import { useTranslations } from 'next-intl';

export function PageHead({ title }: { title: string }) {
  const t = useTranslations('common');
  return (
    <Head>
      <title>{`${title} — ${t('appName')}`}</title>
    </Head>
  );
}