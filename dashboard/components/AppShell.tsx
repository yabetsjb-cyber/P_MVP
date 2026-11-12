import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Sidebar } from './Sidebar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuth } from '@/context/AuthContext';
import { useReservationBadge } from '@/lib/useReservationBadge';

export function AppShell({ children }: { children: ReactNode }) {
  const { pharmacy, user, status, logout } = useAuth();
  const t = useTranslations('auth');

  const { count } = useReservationBadge(status === 'verified');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar reservationBadge={count} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-white flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="font-medium text-sm truncate">
            {pharmacy?.name ?? '—'}
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher />
            <span className="hidden sm:inline text-sm text-gray-500 truncate max-w-[10rem]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-sm text-brand-600 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500 rounded px-1"
            >
              {t('logout')}
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}