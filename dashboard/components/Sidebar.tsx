import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { Menu, X, LayoutList, Package, UploadCloud, Send } from 'lucide-react';
import { useState } from 'react';

export function Sidebar({ reservationBadge }: { reservationBadge: number }) {
  const router = useRouter();
  const t = useTranslations('nav');
  const [isOpen, setIsOpen] = useState(false);

  const items = [
    { href: '/reservations', key: 'reservations' as const, icon: LayoutList, badge: reservationBadge },
    { href: '/stock', key: 'stock' as const, icon: Package, badge: 0 },
    { href: '/import', key: 'import' as const, icon: UploadCloud, badge: 0 },
    { href: '/settings/telegram', key: 'telegram' as const, icon: Send, badge: 0 },
  ];

  return (
    <>
      {/* Mobile Header / Hamburger */}
      <div className="md:hidden fixed top-0 w-full h-14 bg-brand-600 flex items-center justify-between px-4 z-50">
        <div className="text-accent-400 font-bold text-lg">MedFinder</div>
        <button onClick={() => setIsOpen(!isOpen)} className="text-white p-1">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Main Sidebar */}
      <nav
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-brand-600 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center px-6 text-accent-400 font-bold text-xl tracking-tight hidden md:flex">
          MedFinder
        </div>
        <ul className="flex-1 py-4 space-y-1">
          {items.map((item) => {
            const active = router.pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between mx-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    active
                      ? 'bg-accent-400 text-brand-700 font-semibold'
                      : 'text-gray-300 hover:bg-brand-500 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} className={active ? 'text-brand-700' : 'text-gray-400'} />
                    <span>{t(item.key)}</span>
                  </div>
                  {item.badge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold ${active ? 'bg-brand-700 text-white' : 'bg-danger-500 text-white'}`}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}