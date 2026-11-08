import { PageHead } from '@/components/PageHead';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';

export default function IndexPage() {
  const { status } = useAuth();
  const router = useRouter();
  const t = useTranslations('common');

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'pending' || status === 'no-pharmacy') router.replace('/pending');
    else if (status === 'suspended' || status === 'rejected') router.replace('/suspended');
    else if (status === 'verified') router.replace('/reservations');
  }, [status, router]);

  return (
    <>
    <PageHead title={t('loading')} />
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      {t('loading')}
    </div>
  </>
  );
}