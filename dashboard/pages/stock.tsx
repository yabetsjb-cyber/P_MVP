import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

interface PatchResponse {
  item: unknown;
}

interface PatchBody {
  quantity?: number;
  addQuantity?: number;
  expiryDate?: string;
}

type DialogMode = 'markOut' | 'restore';

export default function StockPage() {
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

  if (auth.status !== 'verified') return null;

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
      const result = await api(`/v1/pharmacy/inventory/${dialogItem.id}/out-of-stock`, {
        method: 'PUT',
      });
      setDialogBusy(false);
      if (!result.ok) {
        setDialogError(errorMessage(result.error));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      setDialogMode(null);
      setDialogItem(null);
      return;
    }

    // restore
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
      <h1 className="text-lg font-semibold mb-4">{t('title')}</h1>

      {query.isLoading && (
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      )}

      {query.data && !query.data.ok && (
        <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-3">
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
                    <th className="px-3 py-2 font-medium text-right">{t('columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const isEditing = editingId === item.id;
                    return (
                      <tr key={item.id} className="border-t align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {item.brand_name}
                            {item.is_out_of_stock && (
                              <span className="ml-2 inline-block text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                {t('outOfStock')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.generic_name} · {item.strength} · {item.pack_size}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              disabled={saving}
                              aria-label={t('columns.qtyOnHand')}
                              aria-invalid={editFieldErrors.quantity ? true : undefined}
                              className="w-20 rounded border-gray-300 text-right focus:border-brand-500 focus:ring-brand-500"
                            />
                          ) : (
                            item.qty_on_hand
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{item.qty_reserved}</td>
                        <td className="px-3 py-2 text-right font-medium">{item.available}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editExpiry}
                              onChange={(e) => setEditExpiry(e.target.value)}
                              disabled={saving}
                              aria-label={t('columns.expiry')}
                              aria-invalid={editFieldErrors.expiryDate ? true : undefined}
                              className="rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
                            />
                          ) : (
                            formatDate(item.expiry_date)
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {formatDate(item.updated_at)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveEdit(item)}
                                  disabled={saving}
                                  className="text-xs px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                                >
                                  {saving ? t('saving') : tCommon('save')}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {tCommon('cancel')}
                                </button>
                              </div>
                              {editFieldErrors.quantity && (
                                <span className="text-xs text-danger-600">
                                  {editFieldErrors.quantity}
                                </span>
                              )}
                              {editFieldErrors.expiryDate && (
                                <span className="text-xs text-danger-600">
                                  {editFieldErrors.expiryDate}
                                </span>
                              )}
                              {editFieldErrors._form && (
                                <span className="text-xs text-danger-600">
                                  {editFieldErrors._form}
                                </span>
                              )}
                              {editError && (
                                <span className="text-xs text-danger-600 max-w-[16rem] text-right">
                                  {editError}
                                </span>
                              )}
                            </div>
                          ) : item.is_out_of_stock ? (
                            <button
                              type="button"
                              onClick={() => openRestore(item)}
                              disabled={editingId !== null}
                              className="text-xs px-2 py-1 rounded border border-brand-500 text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                            >
                              {t('restore')}
                            </button>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                disabled={editingId !== null}
                                className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {t('edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => openMarkOut(item)}
                                disabled={editingId !== null}
                                className="text-xs px-2 py-1 rounded border border-danger-500 text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                              >
                                {t('markOut')}
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
          )}
        </>
      )}

      {dialogMode && dialogItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4"
          >
            <h2 id="dialog-title" className="text-lg font-semibold">
              {dialogMode === 'markOut'
                ? t('markOutConfirmTitle')
                : t('restoreTitle')}
            </h2>

            <p className="text-sm text-gray-700">
              {dialogMode === 'markOut'
                ? dialogItem.qty_reserved > 0
                  ? t('markOutConfirmBodyWithReserved', { count: dialogItem.qty_reserved })
                  : t('markOutConfirmBody')
                : t('restoreBody')}
            </p>

            {dialogMode === 'markOut' && (
              <p className="text-sm font-medium text-gray-800">{dialogItem.brand_name}</p>
            )}

            {dialogMode === 'restore' && (
              <>
                <p className="text-sm font-medium text-gray-800">{dialogItem.brand_name}</p>
                <label className="block">
                  <span className="text-sm font-medium">{t('restoreQtyLabel')}</span>
                  <input
                    type="number"
                    min={1}
                    value={restoreQty}
                    onChange={(e) => setRestoreQty(e.target.value)}
                    disabled={dialogBusy}
                    autoFocus
                    className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-xs text-gray-500 mt-1 block">
                    {t('restoreHint', { count: dialogItem.qty_reserved })}
                  </span>
                </label>
              </>
            )}

            {dialogError && (
              <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-2">
                {dialogError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={dialogBusy}
                className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDialog}
                disabled={dialogBusy}
                className={`text-sm px-3 py-1.5 rounded text-white disabled:opacity-50 ${
                  dialogMode === 'markOut'
                    ? 'bg-danger-600 hover:bg-danger-500'
                    : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {dialogBusy
                  ? t('dialogBusy')
                  : dialogMode === 'markOut'
                    ? t('markOutConfirmYes')
                    : t('restoreConfirm')}
              </button>
            </div>
          </div>
        </div>
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