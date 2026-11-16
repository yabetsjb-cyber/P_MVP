import Link from 'next/link';
import { useRouter } from 'next/router';
import { Search, MapPin, Calendar, User } from 'lucide-react';

export function BottomNav() {
  const router = useRouter();
  const items = [
    { href: '/', icon: Search, label: 'Search' },
    { href: '/map', icon: MapPin, label: 'Map' },
    { href: '/reservations', icon: Calendar, label: 'Reservations' },
    { href: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 w-full bg-white border-t border-gray-100 pb-safe pt-2 px-4 shadow-[0_-4px_10px_-5px_rgba(0,0,0,0.05)] z-50">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {items.map((item) => {
          const active = router.pathname === item.href;
          const Icon = item.icon;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}