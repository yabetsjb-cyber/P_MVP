import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';

interface SidebarProps {
  reservationBadge: number;
}

export function Sidebar({ reservationBadge }: SidebarProps) {
  const router = useRouter();
  const t = useTranslations('nav');

  const items = [
    { href: '/reservations', key: 'reservations' as const, badge: reservationBadge },
    { href: '/stock', key: 'stock' as const, badge: 0 },
    { href: '/import', key: 'import' as const, badge: 0 },
    { href: '/settings/telegram', key: 'telegram' as const, badge: 0 },
  ];

  return (
    <nav
      aria-label="Main"
      className="hidden md:flex md:flex-col w-56 bg-white border-r shrink-0"
    >
      <div className="h-14 border-b flex items-center px-4 font-semibold text-brand-700">
        MedFinder
      </div>
      <ul className="py-2">
        {items.map((item) => {
          const active = router.pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-between px-4 py-2 text-sm ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-medium border-r-2 border-brand-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{t(item.key)}</span>
                {item.badge > 0 && (
                  <span
                    aria-label={`${item.badge} new`}
                    className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-danger-600 text-white text-xs font-medium"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}