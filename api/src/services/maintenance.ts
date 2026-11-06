import type { PoolClient } from 'pg';
import { pool } from '../db';
import { tx } from '../lib/tx';
import { config } from '../config';
import { sleepUnless } from '../lib/sleep';
import { closeActive } from './pharmacyReservations';
import { notifyReservation, notifyCustomerSuspended } from './notifications';

const R = config.reservation;
const NS = config.noShow;
const RT = config.retention;
const BATCH = 100;

// ---------- No-shows ----------
async function recordNoShow(c: PoolClient, customerId: string) {
  await c.query('UPDATE customers SET no_show_count = no_show_count + 1 WHERE id = $1', [customerId]);

  // Strikes = uncollected reservations inside the rolling window.
  // The one we just closed counts too, because it is in this same transaction.
  const { rows: [{ n }] } = await c.query(
    `SELECT count(*)::int AS n FROM reservations
      WHERE customer_id = $1 AND status = 'expired' AND closed_reason = 'pickup_timeout'
        AND closed_at > now() - make_interval(days => $2::int)`,
    [customerId, NS.windowDays]
  );

  if (n >= NS.strikesToSuspend) {
    const { rows: [s] } = await c.query(
      `UPDATE customers
          SET suspended_until = GREATEST(coalesce(suspended_until, now()), now() + make_interval(days => $2::int))
        WHERE id = $1
        RETURNING suspended_until`,
      [customerId, NS.suspendDays]
    );
    await notifyCustomerSuspended(c, customerId, s.suspended_until);
  }
}

// ---------- Expire one reservation ----------
async function expireOne(id: string): Promise<boolean> {
  return tx(async (c) => {
    // Lock order: customer -> reservation -> stock row (the same order every other flow uses)
    const { rows: [pre] } = await c.query('SELECT customer_id FROM reservations WHERE id = $1', [id]);
    if (!pre) return false;
    await c.query('SELECT 1 FROM customers WHERE id = $1 FOR UPDATE', [pre.customer_id]);

    // Re-check that it is STILL overdue now that we hold the lock
    const { rows: [r] } = await c.query(
      `SELECT id, inventory_id, qty, status, customer_id
         FROM reservations
        WHERE id = $1
          AND ((status = 'requested' AND respond_by <= now())
            OR (status = 'confirmed' AND pickup_by <= now() - make_interval(mins => $2::int)))
          FOR UPDATE`,
      [id, R.pickupGraceMinutes]
    );
    if (!r) return false;   // answered, cancelled or collected in the meantime

    const noResponse = r.status === 'requested';
    await closeActive(
      c, r, 'expired',
      noResponse ? 'respond_timeout' : 'pickup_timeout',
      { type: 'system', id: null },
      { note: noResponse ? 'the pharmacy did not respond in time' : 'not collected in time' }
    );
    await notifyReservation(c, id, noResponse ? 'expired_no_response' : 'expired_not_collected');
    if (!noResponse) await recordNoShow(c, r.customer_id);   // only the customer's own failure is a strike
    return true;
  });
}

// ---------- The sweep ----------
async function sweepBatch(): Promise<{ found: number; expired: number }> {
  const { rows } = await pool.query(
    `(SELECT id FROM reservations WHERE status = 'requested' AND respond_by <= now() LIMIT $2)
     UNION ALL
     (SELECT id FROM reservations
       WHERE status = 'confirmed' AND pickup_by <= now() - make_interval(mins => $1::int) LIMIT $2)`,
    [R.pickupGraceMinutes, BATCH]
  );
  let expired = 0;
  for (const r of rows) {
    try {
      if (await expireOne(r.id)) expired++;
    } catch (e: any) {
      console.error(`could not expire reservation ${r.id}:`, e.message);
    }
  }
  return { found: rows.length, expired };
}

// Returns how many reservations were expired
export async function sweepExpired(shouldStop: () => boolean = () => false): Promise<number> {
  let total = 0;
  for (let round = 0; round < 50 && !shouldStop(); round++) {
    const { found, expired } = await sweepBatch();
    total += expired;
    if (found < BATCH) break;   // nothing more is waiting
  }
  return total;
}

// ---------- Cleanup (old data) ----------
export async function runCleanup(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const run = async (label: string, sql: string, params: unknown[] = []) => {
    const res = await pool.query(sql, params);
    out[label] = res.rowCount ?? 0;
  };

  // A day-old alert is no use to anyone: stop retrying it
  await run('staleDeliveries',
    `UPDATE notification_deliveries SET status = 'failed', last_error = 'too old to send'
      WHERE status = 'pending' AND created_at < now() - interval '1 day'`);
  await run('oldDeliveries',
    `DELETE FROM notification_deliveries
      WHERE status <> 'pending' AND created_at < now() - make_interval(days => $1::int)`, [RT.deliveriesDays]);
  await run('oldNotifications',
    `DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1::int)`, [RT.notificationsDays]);
  // Deleting a customer session also deletes the push tokens bound to it
  await run('expiredSessions', `DELETE FROM customer_sessions WHERE expires_at < now()`);
  await run('expiredStaffSessions', `DELETE FROM sessions WHERE expires_at < now()`);
  await run('staleLinkTokens', `DELETE FROM telegram_link_tokens WHERE expires_at < now() - interval '1 day'`);
  await run('oldSearchEvents',
    `DELETE FROM search_events WHERE created_at < now() - make_interval(days => $1::int)`, [RT.searchEventsDays]);
  await run('oldImportRows',
    `DELETE FROM import_rows
      WHERE import_id IN (SELECT id FROM imports WHERE created_at < now() - make_interval(days => $1::int))`,
    [RT.importRowsDays]);

  if (Object.values(out).some((n) => n > 0)) console.log('Cleanup:', JSON.stringify(out));
  return out;
}

// ---------- The loop the worker runs ----------
export async function runMaintenanceLoop(shouldStop: () => boolean) {
  console.log(`Maintenance loop started (overdue check every ${R.sweepSeconds}s, cleanup every 6h)`);
  let nextCleanup = Date.now() + 30_000;   // first cleanup 30 s after start

  while (!shouldStop()) {
    try {
      const n = await sweepExpired(shouldStop);
      if (n > 0) console.log(`Expired ${n} reservation(s)`);
    } catch (e: any) {
      console.error('expiry sweep error:', e.message);
    }

    if (Date.now() >= nextCleanup) {
      try {
        await runCleanup();
      } catch (e: any) {
        console.error('cleanup error:', e.message);
      }
      nextCleanup = Date.now() + 6 * 3_600_000;
    }
    await sleepUnless(R.sweepSeconds * 1000, shouldStop);
  }
}