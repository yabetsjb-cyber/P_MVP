import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';

const items = [
  { href: '/reservations', key: 'reservations' },
  { href: '/stock', key: 'stock' },
  { href: '/import', key: 'import' },
  { href: '/settings/telegram', key: 'telegram' },
] as const;

export function Sidebar() {
  const router = useRouter();
  const t = useTranslations('nav');

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
                className={`block px-4 py-2 text-sm ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-medium border-r-2 border-brand-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}