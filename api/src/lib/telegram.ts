import { config } from '../config';

export class TelegramError extends Error {
  constructor(public code: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

export const telegramEnabled = () => !!config.telegram.botToken;

async function call<T>(method: string, body: object, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json: any = await res.json().catch(() => null);
  if (!json?.ok) {
    throw new TelegramError(json?.error_code ?? res.status, json?.description ?? 'Telegram request failed',
                            json?.parameters?.retry_after);
  }
  return json.result as T;
}

// Plain text only (no Markdown), so nothing needs escaping
export async function sendTelegram(chatId: number, text: string): Promise<void> {
  if (!telegramEnabled()) {
    console.log(`[TELEGRAM -> ${chatId}] ${text}`);   // console mode
    return;
  }
  await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
}

// Long polling: Telegram holds the request open up to 25 s until a message arrives
export const getUpdates = (offset: number) =>
  call<any[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40_000);