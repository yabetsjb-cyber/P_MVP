import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function SuspendedPage() {
  const t = useTranslations('verification');
  const tAuth = useTranslations('auth');
  const { pharmacy, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-danger-600">
          {t('suspendedTitle')}
        </h1>
        <p className="text-sm text-gray-600">{t('suspendedBody')}</p>
        {pharmacy?.status_reason && (
          <p className="text-sm text-gray-700">
            {t('suspendedReason', { reason: pharmacy.status_reason })}
          </p>
        )}
        <button
          onClick={logout}
          className="text-sm text-brand-600 hover:underline"
        >
          {tAuth('logout')}
        </button>
      </div>
    </div>
  );
}