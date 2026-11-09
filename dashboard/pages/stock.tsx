import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api, errorMessage } from '@/lib/api';

interface InventoryItem {
  id: string;
  medicine_id: string;
  brand_name: string;
  generic_name: string;
  strength: string;
  pack_size: string;
  rx_status: 'RX' | 'OTC';
  qty_on_hand: number;
  qty_reserved: number;
  available: number;
  expiry_date: string;
  is_out_of_stock: boolean;
  updated_at: string;
  expiring_soon: boolean;
}

interface InventoryResponse {
  total: number;
  items: InventoryItem[];
}

export default function StockPage() {
  // All hooks must run in the same order on every render.
  // The `if (auth.status !== 'verified') return null;` guard goes AFTER all hooks.
  const auth = useAuthGuard();
  const t = useTranslations('stock');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['stock'],
    queryFn: () => api<InventoryResponse>('/v1/pharmacy/inventory'),
    enabled: auth.status === 'verified',
    staleTime: 60_000,
  });

  const items = query.data?.ok ? query.data.data.items : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.brand_name.toLowerCase().includes(q) ||
        i.generic_name.toLowerCase().includes(q) ||
        i.strength.toLowerCase().includes(q),
    );
  }, [items, search]);

  // Guard goes here, after every hook has run.
  if (auth.status !== 'verified') return null;

  return (
    <AppShell>
      <h1 className="text-lg font-semibold mb-4">{t('title')}</h1>

      {query.isLoading && (
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      )}

      {query.data && !query.data.ok && (
        <div
          role="alert"
          className="text-sm text-danger-600 bg-danger-50 rounded p-3"
        >
          {errorMessage(query.data.error)}
        </div>
      )}

      {query.data?.ok && items.length === 0 && (
        <p className="text-sm text-gray-500">{t('empty')}</p>
      )}

      {query.data?.ok && items.length > 0 && (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="mb-4 w-full max-w-md rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
          />

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500">{t('noResults')}</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('columns.medicine')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('columns.qtyOnHand')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('columns.qtyReserved')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('available')}</th>
                    <th className="px-3 py-2 font-medium">{t('columns.expiry')}</th>
                    <th className="px-3 py-2 font-medium">{t('columns.updated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.brand_name}</div>
                        <div className="text-xs text-gray-500">
                          {item.generic_name} · {item.strength} · {item.pack_size}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{item.qty_on_hand}</td>
                      <td className="px-3 py-2 text-right">{item.qty_reserved}</td>
                      <td className="px-3 py-2 text-right font-medium">{item.available}</td>
                      <td className="px-3 py-2">{formatDate(item.expiry_date)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{formatDate(item.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}