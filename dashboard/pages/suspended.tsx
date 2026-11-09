import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function SuspendedPage() {
  const t = useTranslations('verification');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { pharmacy, status, logout } = useAuth();

  // Defensive redirects. /suspended is only valid for suspended/rejected.
  useEffect(() => {
    if (status === 'verified') router.replace('/reservations');
    else if (status === 'pending' || status === 'no-pharmacy')
      router.replace('/pending');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-danger-600">
            {t('suspendedTitle')}
          </h1>
          {pharmacy && (
            <p className="text-sm font-medium text-gray-700">{pharmacy.name}</p>
          )}
        </div>

        <p className="text-sm text-gray-600">{t('suspendedBody')}</p>

        {pharmacy?.status_reason && (
          <div className="text-sm bg-gray-50 rounded p-3 border-l-2 border-danger-500">
            <span className="font-medium block mb-1">
              {t('suspendedReasonLabel')}
            </span>
            <span className="text-gray-700">{pharmacy.status_reason}</span>
          </div>
        )}

        <p className="text-xs text-gray-500 text-center">
          {t('contactSupport')}
        </p>

        <button
          onClick={logout}
          className="w-full text-sm text-brand-600 hover:underline"
        >
          {tAuth('logout')}
        </button>
      </div>
    </div>
  );
}