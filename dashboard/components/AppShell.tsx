import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Sidebar } from './Sidebar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuth } from '@/context/AuthContext';
import { useReservationBadge } from '@/lib/useReservationBadge';
import { useReservationSound } from '@/lib/useReservationSound';
import { LogOut } from 'lucide-react';

export function AppShell({ children }: { children: ReactNode }) {
  const { pharmacy, user, status, logout } = useAuth();
  const t = useTranslations('auth');
  const tSound = useTranslations('sound');

  const { count, query } = useReservationBadge(status === 'verified');
  const dataReady = query.data !== undefined;
  const sound = useReservationSound(count, dataReady);

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar reservationBadge={count} />
      <div className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        <header className="h-16 bg-surface/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30 border-b border-gray-200/50">
          <div>
            <h2 className="font-semibold text-lg text-gray-900">{pharmacy?.name ?? '—'}</h2>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            {sound.supported && (
              <button
                type="button"
                onClick={sound.toggle}
                aria-label={sound.enabled ? tSound('disable') : tSound('enable')}
                aria-pressed={sound.enabled}
                className={`p-2 rounded-full transition-colors ${sound.enabled ? 'bg-accent-100 text-brand-600' : 'text-gray-400 hover:bg-gray-200'}`}
              >
                {sound.enabled ? '🔔' : '🔕'}
              </button>
            )}
            <LanguageSwitcher />
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
              <span className="truncate max-w-[10rem]">{user?.email}</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-2 text-gray-500 hover:text-danger-600 hover:bg-danger-50 rounded-full transition-colors"
              title={t('logout')}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}