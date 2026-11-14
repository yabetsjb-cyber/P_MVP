import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, Send, Trash2, CheckCircle2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useTelegramLink } from '@/lib/useTelegramLink';
import { errorMessage } from '@/lib/api';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { StatusBadge } from '@/lib/ui/StatusBadge';

export default function TelegramPage() {
  const auth = useAuthGuard();
  const t = useTranslations('settings');
  const tg = useTelegramLink(auth.status === 'verified');

  if (auth.status !== 'verified') return null;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-600">{t('title')}</h1>
      </div>

      <Card className="p-8 max-w-3xl space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
          <div className="p-2 bg-brand-50 rounded-lg">
            <Send className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{t('telegramTitle')}</h2>
        </div>

        {tg.error && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-4">{errorMessage(tg.error)}</div>}

        {!tg.isLoading && !tg.botConfigured && !tg.error && (
          <div className="text-sm text-gray-600 bg-warning-50 p-4 rounded-xl border border-warning-100">{t('telegramBotNotConfigured')}</div>
        )}

        {!tg.isLoading && tg.links.length === 0 && !tg.error && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
              <Link className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-900 mb-1">{t('telegramNoLinks')}</p>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">{t('telegramNoLinksHint')}</p>
            {tg.botConfigured && (
              <Button onClick={tg.openDialog} size="lg">{t('telegramConnect')}</Button>
            )}
          </div>
        )}

        {!tg.isLoading && tg.links.length > 0 && (
          <div className="space-y-6">
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {tg.links.map((l) => (
                <li key={l.chatId} className="flex items-center justify-between p-4 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      {l.label ?? `Chat ${l.chatId}`}
                      <StatusBadge status="success">Connected</StatusBadge>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {l.linkedBy && <span>{t('telegramLinkedBy', { name: l.linkedBy })}</span>}
                      {l.linkedBy && <span className="mx-1">·</span>}
                      <span>{t('telegramLinkedAt', { time: formatDate(l.linkedAt) })}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => tg.setDisconnectTarget(l)} className="text-danger-600 border-danger-200 hover:bg-danger-50">
                    <Trash2 size={16} className="mr-2" />
                    {t('telegramDisconnect')}
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <div className="flex gap-3">
                {tg.botConfigured && (
                  <Button variant="secondary" onClick={tg.openDialog}>{t('telegramAddAnother')}</Button>
                )}
                <Button variant="primary" onClick={tg.sendTest} disabled={!tg.botConfigured || tg.testState === 'sending'}>
                  {tg.testState === 'sending' ? t('telegramTestSending') : t('telegramTestAlert')}
                </Button>
              </div>
            </div>

            {tg.testState === 'sent' && <div className="text-sm text-success-600 bg-success-50 rounded-xl p-3 flex items-center gap-2"><CheckCircle2 size={16} /> {t('telegramTestSent', { count: tg.links.length })}</div>}
            {tg.testState === 'error' && <div className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{t('telegramTestFailed')}</div>}
          </div>
        )}
      </Card>

      {tg.dialogOpen && <ConnectDialog tg={tg} />}
      {tg.disconnectTarget && <DisconnectConfirmDialog tg={tg} />}
    </AppShell>
  );
}

function ConnectDialog({ tg }: { tg: ReturnType<typeof useTelegramLink> }) {
  const t = useTranslations('settings'); const tCommon = useTranslations('common'); const [copied, setCopied] = useState(false);
  const expired = tg.generatedLink !== null && tg.secondsUntilExpiry === 0;

  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') tg.closeDialog(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [tg]);

  const onCopy = async () => {
    if (!tg.generatedLink?.url) return;
    try { await navigator.clipboard.writeText(tg.generatedLink.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget) tg.closeDialog(); }} role="presentation">
      <div role="dialog" className="bg-white rounded-3xl shadow-float max-w-md w-full p-8 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">{t('telegramConnectTitle')}</h2>
        <p className="text-sm text-gray-600">{t('telegramInstructions')}</p>
        {tg.generating && <p className="text-sm text-gray-500">{t('telegramGenerating')}</p>}
        {tg.generateError && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{tg.generateError}</div>}

        {tg.generatedLink && !expired && (
          <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <a href={tg.generatedLink.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block w-full text-center text-sm px-4 py-3 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors">
              {t('telegramOpenButton')}
            </a>
            <div className="flex gap-2">
              <input type="text" readOnly value={tg.generatedLink.url ?? ''} className="flex-1 min-w-0 text-xs font-mono rounded-xl border-gray-300 bg-white" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" onClick={onCopy} className="shrink-0">{copied ? t('telegramCopied') : t('telegramCopyLink')}</Button>
            </div>
            <p className="text-xs text-gray-500 text-center font-medium">{t('telegramExpiresIn', { time: formatMmSs(tg.secondsUntilExpiry) })}</p>
          </div>
        )}

        {expired && <div className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{t('telegramExpired')}</div>}
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={tg.closeDialog} disabled={tg.generating}>{tCommon('close')}</Button>
        </div>
      </div>
    </div>
  );
}

function DisconnectConfirmDialog({ tg }: { tg: ReturnType<typeof useTelegramLink> }) {
  const t = useTranslations('settings'); const tCommon = useTranslations('common');

  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !tg.disconnecting) tg.setDisconnectTarget(null); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [tg]);

  const target = tg.disconnectTarget;
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-700/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget && !tg.disconnecting) tg.setDisconnectTarget(null); }} role="presentation">
      <div role="dialog" className="bg-white rounded-3xl shadow-float max-w-md w-full p-8 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">{t('telegramDisconnectConfirmTitle')}</h2>
        <p className="text-sm text-gray-600">{t('telegramDisconnectConfirmBody')}</p>
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 font-medium text-gray-900 text-sm">{target.label ?? `Chat ${target.chatId}`}</div>
        {tg.disconnectError && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3">{tg.disconnectError}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => tg.setDisconnectTarget(null)} disabled={tg.disconnecting}>{tCommon('cancel')}</Button>
          <Button variant="danger" onClick={tg.confirmDisconnect} disabled={tg.disconnecting}>{tg.disconnecting ? t('telegramDisconnecting') : t('telegramDisconnect')}</Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string { return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function formatMmSs(seconds: number): string { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${String(s).padStart(2, '0')}`; }