import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Search, PackageOpen, Pencil, Ban, RotateCcw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api, errorMessage } from '@/lib/api';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { Input } from '@/lib/ui/Input';
import { StatusBadge } from '@/lib/ui/StatusBadge';

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

interface PatchResponse { item: unknown; }
interface PatchBody { quantity?: number; addQuantity?: number; expiryDate?: string; }
type DialogMode = 'markOut' | 'restore';

export default function StockPage() {
  // ============ ALL HOOKS FIRST ============
  const auth = useAuthGuard();
  const t = useTranslations('stock');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [dialogItem, setDialogItem] = useState<InventoryItem | null>(null);
  const [restoreQty, setRestoreQty] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

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

  // ============ GUARD ============
  if (auth.status !== 'verified') return null;

  // ============ HANDLERS ============
  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditQty(String(item.qty_on_hand));
    setEditExpiry(item.expiry_date.slice(0, 10));
    setEditError(null);
    setEditFieldErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditQty('');
    setEditExpiry('');
    setEditError(null);
    setEditFieldErrors({});
    setSaving(false);
  };

  const saveEdit = async (item: InventoryItem) => {
    setEditError(null);
    setEditFieldErrors({});

    const qty = Number(editQty);
    if (!Number.isInteger(qty) || qty < 0) {
      setEditFieldErrors({ quantity: t('invalidQty') });
      return;
    }

    const body: PatchBody = {};
    if (qty !== item.qty_on_hand) body.quantity = qty;
    if (editExpiry && editExpiry !== item.expiry_date.slice(0, 10)) {
      body.expiryDate = editExpiry;
    }

    if (Object.keys(body).length === 0) {
      setEditError(t('noChanges'));
      return;
    }

    setSaving(true);
    const result = await api<PatchResponse>(`/v1/pharmacy/inventory/${item.id}`, {
      method: 'PATCH',
      body,
    });
    setSaving(false);

    if (!result.ok) {
      if (result.error.kind === 'validation') {
        setEditFieldErrors(result.error.fields);
        return;
      }
      if (result.error.kind === 'conflict' && result.error.code === 'BELOW_RESERVED') {
        setEditError(t('belowReserved'));
        return;
      }
      setEditError(errorMessage(result.error));
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['stock'] });
    cancelEdit();
  };

  const openMarkOut = (item: InventoryItem) => {
    setDialogMode('markOut');
    setDialogItem(item);
    setDialogError(null);
  };

  const openRestore = (item: InventoryItem) => {
    setDialogMode('restore');
    setDialogItem(item);
    setRestoreQty('');
    setDialogError(null);
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialogMode(null);
    setDialogItem(null);
    setRestoreQty('');
    setDialogError(null);
  };

  const confirmDialog = async () => {
    if (!dialogItem || !dialogMode) return;
    setDialogError(null);

    if (dialogMode === 'markOut') {
      setDialogBusy(true);
      const result = await api(`/v1/pharmacy/inventory/${dialogItem.id}/out-of-stock`, { method: 'PUT' });
      setDialogBusy(false);
      if (!result.ok) { setDialogError(errorMessage(result.error)); return; }
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      setDialogMode(null);
      setDialogItem(null);
      return;
    }

    const qty = Number(restoreQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setDialogError(t('invalidRestoreQty'));
      return;
    }
    setDialogBusy(true);
    const result = await api<PatchResponse>(`/v1/pharmacy/inventory/${dialogItem.id}`, {
      method: 'PATCH',
      body: { quantity: qty },
    });
    setDialogBusy(false);
    if (!result.ok) {
      if (result.error.kind === 'validation') {
        setDialogError(Object.values(result.error.fields)[0] ?? errorMessage(result.error));
        return;
      }
      setDialogError(errorMessage(result.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['stock'] });
    setDialogMode(null);
    setDialogItem(null);
    setRestoreQty('');
  };

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-brand-600">{t('title')}</h1>
        <div className="w-full sm:w-72">
          <Input
            type="search"
            icon={<Search size={18} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
          />
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-gray-500">{tCommon('loading')}</p>}
      
      {query.data && !query.data.ok && (
        <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-4">
          {errorMessage(query.data.error)}
        </div>
      )}

      {query.data?.ok && items.length === 0 && (
        <Card className="p-12 text-center flex flex-col items-center">
          <PackageOpen size={48} className="text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-1">{t('empty')}</p>
        </Card>
      )}

      {query.data?.ok && items.length > 0 && (
        filtered.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">{t('noResults')}</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs">{t('columns.medicine')}</th>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs text-right">{t('columns.qtyOnHand')}</th>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs text-right">{t('columns.qtyReserved')}</th>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs text-right">{t('available')}</th>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs">{t('columns.expiry')}</th>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs">{t('columns.updated')}</th>
                    <th className="px-6 py-4 font-medium text-gray-500 uppercase tracking-wider text-xs text-right">{t('columns.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item) => {
                    const isEditing = editingId === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 flex items-center gap-2">
                            {item.brand_name}
                            {item.is_out_of_stock && (
                              <StatusBadge status="danger">{t('outOfStock')}</StatusBadge>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {item.generic_name} · {item.strength} · {item.pack_size}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4 text-right">
                          {isEditing ? (
                            <input
                              type="number" min={0} value={editQty} onChange={(e) => setEditQty(e.target.value)} disabled={saving}
                              className="w-20 rounded-lg border-gray-300 text-right text-sm focus:border-brand-500 focus:ring-brand-500"
                            />
                          ) : (
                            <span className="font-medium">{item.qty_on_hand}</span>
                          )}
                        </td>
                        
                        <td className="px-6 py-4 text-right text-gray-500">
                          {item.qty_reserved}
                        </td>
                        
                        <td className="px-6 py-4 text-right font-bold text-brand-600">
                          {item.available}
                        </td>
                        
                        <td className="px-6 py-4 text-gray-600">
                          {isEditing ? (
                            <input
                              type="date" value={editExpiry} onChange={(e) => setEditExpiry(e.target.value)} disabled={saving}
                              className="rounded-lg border-gray-300 text-sm focus:border-brand-500 focus:ring-brand-500"
                            />
                          ) : (
                            formatDate(item.expiry_date)
                          )}
                        </td>
                        
                        <td className="px-6 py-4 text-xs text-gray-400">
                          {formatDate(item.updated_at)}
                        </td>

                        <td className="px-6 py-4 text-right">
                          {isEditing ? (
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveEdit(item)} disabled={saving}>
                                  {saving ? t('saving') : tCommon('save')}
                                </Button>
                                <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={saving}>
                                  {tCommon('cancel')}
                                </Button>
                              </div>
                              {(editError || editFieldErrors.quantity || editFieldErrors.expiryDate) && (
                                <span className="text-xs text-danger-600 text-right max-w-[12rem]">
                                  {editError || editFieldErrors.quantity || editFieldErrors.expiryDate}
                                </span>
                              )}
                            </div>
                          ) : item.is_out_of_stock ? (
                            <button
                              type="button"
                              onClick={() => openRestore(item)}
                              disabled={editingId !== null}
                              title={t('restore')}
                              className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <RotateCcw size={18} />
                            </button>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                disabled={editingId !== null}
                                title={t('edit')}
                                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Pencil size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openMarkOut(item)}
                                disabled={editingId !== null}
                                title={t('markOut')}
                                className="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Ban size={18} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {dialogMode && dialogItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/40 backdrop-blur-sm px-4 transition-opacity" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }} role="presentation">
          <div role="dialog" aria-modal="true" className="bg-white rounded-3xl shadow-float max-w-md w-full p-6 space-y-5">
            <h2 className="text-xl font-bold text-gray-900">
              {dialogMode === 'markOut' ? t('markOutConfirmTitle') : t('restoreTitle')}
            </h2>
            <p className="text-sm text-gray-600">
              {dialogMode === 'markOut'
                ? dialogItem.qty_reserved > 0
                  ? t('markOutConfirmBodyWithReserved', { count: dialogItem.qty_reserved })
                  : t('markOutConfirmBody')
                : t('restoreBody')}
            </p>
            {dialogMode === 'markOut' && (
              <p className="text-sm font-semibold text-brand-600 bg-brand-50 p-3 rounded-xl">{dialogItem.brand_name}</p>
            )}
            {dialogMode === 'restore' && (
              <>
                <p className="text-sm font-semibold text-brand-600 bg-brand-50 p-3 rounded-xl">{dialogItem.brand_name}</p>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">{t('restoreQtyLabel')}</span>
                  <input type="number" min={1} value={restoreQty} onChange={(e) => setRestoreQty(e.target.value)} disabled={dialogBusy} autoFocus className="mt-1 w-full rounded-xl border-gray-300 focus:border-brand-500 focus:ring-brand-500" />
                  <span className="text-xs text-gray-500 mt-1 block">{t('restoreHint', { count: dialogItem.qty_reserved })}</span>
                </label>
              </>
            )}
            {dialogError && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{dialogError}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={closeDialog} disabled={dialogBusy}>{tCommon('cancel')}</Button>
              <Button variant={dialogMode === 'markOut' ? 'danger' : 'primary'} onClick={confirmDialog} disabled={dialogBusy}>
                {dialogBusy ? t('dialogBusy') : dialogMode === 'markOut' ? t('markOutConfirmYes') : t('restoreConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}