import { pool } from '../db';
import { tx } from '../lib/tx';
import { config } from '../config';
import { hashToken } from '../lib/security';
import { sleep } from '../lib/sleep';
import { getUpdates, sendTelegram, telegramEnabled, TelegramError } from '../lib/telegram';

const HELP =
  'I send reservation alerts for your pharmacy.\n\n' +
  'To connect this chat, open your pharmacy dashboard, choose "Connect Telegram" and tap the link it gives you.\n\n' +
  '/status shows what this chat is linked to\n/stop stops the alerts';

interface Incoming { chatId: number; chatType: string; text: string; name: string }

async function linkWithToken(m: Incoming, token: string): Promise<string> {
  return tx(async (c) => {
    // Single use, and only while it hasn't expired
    const { rows: [t] } = await c.query(
      `UPDATE telegram_link_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING pharmacy_id, user_id`,
      [hashToken(token)]
    );

    if (!t) {
      // A repeated /start from a chat that is already linked is harmless
      const { rows: [existing] } = await c.query(
        `SELECT p.name FROM telegram_links l JOIN pharmacies p ON p.id = l.pharmacy_id WHERE l.chat_id = $1`,
        [m.chatId]);
      return existing
        ? `This chat is already linked to ${existing.name}.`
        : 'This link is invalid or has expired. Create a new one in your pharmacy dashboard.';
    }

    const { rows: [p] } = await c.query('SELECT name FROM pharmacies WHERE id = $1', [t.pharmacy_id]);
    const { rows: [{ n }] } = await c.query(
      'SELECT count(*)::int AS n FROM telegram_links WHERE pharmacy_id = $1 AND chat_id <> $2',
      [t.pharmacy_id, m.chatId]);
    if (n >= config.telegram.maxLinksPerPharmacy) {
      return `${p.name} already has ${config.telegram.maxLinksPerPharmacy} linked chats. Remove one in the dashboard, then try again.`;
    }

    await c.query(
      `INSERT INTO telegram_links (chat_id, pharmacy_id, user_id, label)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (chat_id) DO UPDATE
         SET pharmacy_id = EXCLUDED.pharmacy_id, user_id = EXCLUDED.user_id,
             label = EXCLUDED.label, linked_at = now()`,
      [m.chatId, t.pharmacy_id, t.user_id, m.name.slice(0, 80)]
    );
    return `✅ Linked to ${p.name}. You will get reservation alerts here. Send /stop to unlink.`;
  });
}

// Returns the reply to send (or null). Kept separate from the network code so we can test it with curl.
export async function handleMessage(m: Incoming): Promise<string | null> {
  if (m.chatType !== 'private') return 'Please message me in a private chat to connect your pharmacy.';

  const [first = '', arg] = m.text.trim().split(/\s+/);
  const cmd = first.split('@')[0].toLowerCase();

  if (cmd === '/start') return arg ? linkWithToken(m, arg) : HELP;

  if (cmd === '/stop') {
    const { rowCount } = await pool.query('DELETE FROM telegram_links WHERE chat_id = $1', [m.chatId]);
    return rowCount ? 'Alerts stopped. Link again any time from the dashboard.' : 'This chat is not linked to a pharmacy.';
  }

  if (cmd === '/status') {
    const { rows: [l] } = await pool.query(
      `SELECT p.name FROM telegram_links l JOIN pharmacies p ON p.id = l.pharmacy_id WHERE l.chat_id = $1`,
      [m.chatId]);
    return l ? `Linked to ${l.name}. You will get reservation alerts here.` : 'This chat is not linked to a pharmacy yet.';
  }

  return HELP;
}

// Long polling: no public URL needed. (For production we'd switch to a webhook.)
export async function runTelegramBot(shouldStop: () => boolean) {
  if (!telegramEnabled()) {
    console.log('Telegram bot disabled (no TELEGRAM_BOT_TOKEN): alerts are printed to this console instead');
    return;
  }
  console.log('Telegram bot polling started');
  let offset = 0;

  while (!shouldStop()) {
    try {
      const updates = await getUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg?.text) continue;
        try {
          const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
                       || msg.from?.username || 'Telegram user';
          const reply = await handleMessage({ chatId: msg.chat.id, chatType: msg.chat.type, text: msg.text, name });
          if (reply) await sendTelegram(msg.chat.id, reply);
        } catch (e: any) {
          console.warn('could not handle a Telegram message:', e.message);
        }
      }
    } catch (e: any) {
      console.error('telegram poll error:', e.message);
      await sleep(e instanceof TelegramError && e.retryAfter ? e.retryAfter * 1000 : 5000);
    }
  }
}