import { pool } from '../db';
import { sleep } from '../lib/sleep';
import { sendTelegram, TelegramError } from '../lib/telegram';
import { getPush, UnregisteredTokenError } from '../lib/push';

const MAX_ATTEMPTS = 5;

// Retrying cannot help (dead target): fail it now
class PermanentError extends Error {}

async function deliver(d: { channel: string; target: string; payload: any }) {
  if (d.channel === 'telegram') {
    try {
      await sendTelegram(Number(d.target), d.payload.text);
    } catch (e) {
      // 403: the user blocked the bot. 400 "chat not found": the chat is gone. Stop sending there.
      if (e instanceof TelegramError && (e.code === 403 || (e.code === 400 && /chat not found/i.test(e.message)))) {
        await pool.query('DELETE FROM telegram_links WHERE chat_id = $1', [d.target]);
        throw new PermanentError(`Telegram chat removed: ${e.message}`);
      }
      throw e;
    }
    return;
  }

  if (d.channel === 'push') {
    try {
      await getPush().send(d.target, d.payload);
    } catch (e) {
      if (e instanceof UnregisteredTokenError) {
        await pool.query('DELETE FROM push_tokens WHERE token = $1', [d.target]);
        throw new PermanentError('push token no longer registered');
      }
      throw e;
    }
    return;
  }

  throw new PermanentError(`no sender for channel "${d.channel}"`);
}

async function processBatch(): Promise<number> {
  // Claim up to 10 due rows. The 2-minute "lease" means a crashed worker's rows come back by themselves.
  const { rows } = await pool.query(
    `UPDATE notification_deliveries
        SET attempts = attempts + 1, next_attempt_at = now() + interval '2 minutes'
      WHERE id IN (SELECT id FROM notification_deliveries
                    WHERE status = 'pending' AND next_attempt_at <= now()
                    ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED)
      RETURNING id, channel, target, payload, attempts`
  );

  for (const d of rows) {
    try {
      await deliver(d);
      await pool.query(
        `UPDATE notification_deliveries SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`,
        [d.id]);
    } catch (e: any) {
      const giveUp = e instanceof PermanentError || d.attempts >= MAX_ATTEMPTS;
      await pool.query(
        `UPDATE notification_deliveries
            SET last_error = $2,
                status = CASE WHEN $3::boolean THEN 'failed' ELSE 'pending' END,
                next_attempt_at = now() + make_interval(secs => 30 * power(2, $4::int - 1))
          WHERE id = $1`,
        [d.id, String(e.message).slice(0, 300), giveUp, d.attempts]);
    }
  }
  return rows.length;
}

export async function runDeliveryLoop(shouldStop: () => boolean) {
  console.log('Delivery loop started');
  while (!shouldStop()) {
    let handled = 0;
    try {
      handled = await processBatch();
    } catch (e: any) {
      console.error('delivery loop error:', e.message);
    }
    if (handled === 0) await sleep(2000);   // idle: check again in 2 seconds
  }
}