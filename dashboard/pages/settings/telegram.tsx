import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useTelegramLink } from '@/lib/useTelegramLink';
import { errorMessage } from '@/lib/api';

export default function TelegramPage() {
  // ============ ALL HOOKS FIRST ============
  const auth = useAuthGuard();
  const t = useTranslations('settings');
  const tg = useTelegramLink(auth.status === 'verified');

  // ============ GUARD ============
  if (auth.status !== 'verified') return null;

  // ============ RENDER ============
  return (
    <AppShell>
      <h1 className="text-lg font-semibold mb-4">{t('title')}</h1>

      <div className="bg-white rounded-lg border p-6 max-w-3xl space-y-4">
        <h2 className="text-base font-semibold">{t('telegramTitle')}</h2>

        {tg.error && (
          <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-3">
            {errorMessage(tg.error)}
          </div>
        )}

        {!tg.isLoading && !tg.botConfigured && !tg.error && (
          <p className="text-sm text-gray-600">{t('telegramBotNotConfigured')}</p>
        )}

        {!tg.isLoading && tg.links.length === 0 && !tg.error && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">{t('telegramNoLinks')}</p>
            <p className="text-xs text-gray-500">{t('telegramNoLinksHint')}</p>
            {tg.botConfigured && (
              <button
                type="button"
                onClick={tg.openDialog}
                className="text-sm px-4 py-2 rounded bg-brand-600 text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {t('telegramConnect')}
              </button>
            )}
          </div>
        )}

        {!tg.isLoading && tg.links.length > 0 && (
          <>
            <ul className="divide-y border rounded">
              {tg.links.map((l) => (
                <li
                  key={l.chatId}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {l.label ?? `Chat ${l.chatId}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {l.linkedBy && (
                        <span>{t('telegramLinkedBy', { name: l.linkedBy })}</span>
                      )}
                      {l.linkedBy && <span> · </span>}
                      <span>
                        {t('telegramLinkedAt', { time: formatDate(l.linkedAt) })}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => tg.setDisconnectTarget(l)}
                    className="text-sm text-danger-600 hover:underline shrink-0"
                  >
                    {t('telegramDisconnect')}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {tg.botConfigured && (
                <button
                  type="button"
                  onClick={tg.openDialog}
                  className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
                >
                  {t('telegramAddAnother')}
                </button>
              )}
              <button
                type="button"
                onClick={tg.sendTest}
                disabled={!tg.botConfigured || tg.testState === 'sending'}
                className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {tg.testState === 'sending'
                  ? t('telegramTestSending')
                  : t('telegramTestAlert')}
              </button>
            </div>

            {tg.testState === 'sent' && (
              <div className="text-sm text-success-600 bg-success-50 rounded p-2">
                {t('telegramTestSent', { count: tg.links.length })}
              </div>
            )}
            {tg.testState === 'error' && (
              <div className="text-sm text-danger-600 bg-danger-50 rounded p-2">
                {t('telegramTestFailed')}
              </div>
            )}
          </>
        )}
      </div>

      {tg.dialogOpen && <ConnectDialog tg={tg} />}
      {tg.disconnectTarget && <DisconnectConfirmDialog tg={tg} />}
    </AppShell>
  );
}

function ConnectDialog({ tg }: { tg: ReturnType<typeof useTelegramLink> }) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const expired = tg.generatedLink !== null && tg.secondsUntilExpiry === 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tg.closeDialog();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tg]);

  const onCopy = async () => {
    if (!tg.generatedLink?.url) return;
    try {
      await navigator.clipboard.writeText(tg.generatedLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — user can select the input manually.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) tg.closeDialog();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-dialog-title"
        className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4"
      >
        <h2 id="connect-dialog-title" className="text-lg font-semibold">
          {t('telegramConnectTitle')}
        </h2>
        <p className="text-sm text-gray-600">{t('telegramInstructions')}</p>

        {tg.generating && (
          <p className="text-sm text-gray-500">{t('telegramGenerating')}</p>
        )}

        {tg.generateError && (
          <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-2">
            {tg.generateError}
          </div>
        )}

        {tg.generatedLink && !expired && (
          <div className="space-y-3">
            <a
              href={tg.generatedLink.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-sm px-3 py-2 rounded bg-brand-600 text-white hover:bg-brand-700"
            >
              {t('telegramOpenButton')}
            </a>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={tg.generatedLink.url ?? ''}
                className="flex-1 min-w-0 text-xs font-mono rounded border-gray-300 bg-gray-50"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={onCopy}
                className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 shrink-0"
              >
                {copied ? t('telegramCopied') : t('telegramCopyLink')}
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              {t('telegramExpiresIn', { time: formatMmSs(tg.secondsUntilExpiry) })}
            </p>
          </div>
        )}

        {expired && (
          <div className="text-sm text-danger-600 bg-danger-50 rounded p-2">
            {t('telegramExpired')}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={tg.closeDialog}
            disabled={tg.generating}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {tCommon('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisconnectConfirmDialog({
  tg,
}: {
  tg: ReturnType<typeof useTelegramLink>;
}) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !tg.disconnecting) tg.setDisconnectTarget(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tg]);

  const target = tg.disconnectTarget;
  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !tg.disconnecting) {
          tg.setDisconnectTarget(null);
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disconnect-dialog-title"
        className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4"
      >
        <h2 id="disconnect-dialog-title" className="text-lg font-semibold">
          {t('telegramDisconnectConfirmTitle')}
        </h2>
        <p className="text-sm text-gray-700">{t('telegramDisconnectConfirmBody')}</p>
        <p className="text-sm font-medium text-gray-800">
          {target.label ?? `Chat ${target.chatId}`}
        </p>

        {tg.disconnectError && (
          <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded p-2">
            {tg.disconnectError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => tg.setDisconnectTarget(null)}
            disabled={tg.disconnecting}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={tg.confirmDisconnect}
            disabled={tg.disconnecting}
            className="text-sm px-3 py-1.5 rounded bg-danger-600 text-white hover:bg-danger-500 disabled:opacity-50"
          >
            {tg.disconnecting ? t('telegramDisconnecting') : t('telegramDisconnect')}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}