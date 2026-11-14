import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PageHead } from '@/components/PageHead';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';

export default function SuspendedPage() {
  const t = useTranslations('verification');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { pharmacy, status, logout } = useAuth();

  useEffect(() => {
    if (status === 'verified') router.replace('/reservations');
    else if (status === 'pending' || status === 'no-pharmacy') router.replace('/pending');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      </div>
    );
  }

  return (
    <>
      <PageHead title={t('suspendedTitle')} />
      <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-8">
        <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
        
        <Card className="max-w-md w-full p-8 space-y-6 border-danger-200">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-danger-50 mb-4">
              <AlertTriangle className="w-8 h-8 text-danger-600" />
            </div>
            <h1 className="text-2xl font-bold text-danger-600 mb-2">{t('suspendedTitle')}</h1>
            {pharmacy && <p className="text-sm font-medium text-gray-900">{pharmacy.name}</p>}
          </div>

          <p className="text-sm text-gray-600 text-center">{t('suspendedBody')}</p>

          {pharmacy?.status_reason && (
            <div className="bg-danger-50 rounded-xl p-4 border border-danger-100">
              <span className="text-xs font-bold text-danger-800 uppercase tracking-wider block mb-1">
                {t('suspendedReasonLabel')}
              </span>
              <span className="text-sm text-danger-700 font-medium">{pharmacy.status_reason}</span>
            </div>
          )}

          <p className="text-xs text-gray-500 text-center bg-gray-50 p-3 rounded-lg">
            {t('contactSupport')}
          </p>

          <Button onClick={logout} variant="secondary" className="w-full mt-2">
            <LogOut size={16} className="mr-2" />
            {tAuth('logout')}
          </Button>
        </Card>
      </div>
    </>
  );
}