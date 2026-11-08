import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';

export default function TelegramPage() {
  const auth = useAuthGuard();
  const t = useTranslations('settings');
  if (auth.status !== 'verified') return null;
  return (
    <AppShell>
      <h1 className="text-lg font-semibold mb-4">{t('title')}</h1>
      <p className="text-sm text-gray-500">{t('telegramNotConnected')}</p>
    </AppShell>
  );
}