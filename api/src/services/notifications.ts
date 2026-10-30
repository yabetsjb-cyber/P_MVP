import type { PoolClient } from 'pg';
import { config } from '../config';

const R = config.reservation;

interface Msg {
  title: string;
  body: string;                             // full detail: shown only in the signed-in inbox
  push?: { title: string; body: string };   // deliberately generic
  telegram?: string;                        // deliberately generic
}

export type ReservationEvent =
  | 'requested' | 'confirmed' | 'declined' | 'cancelled_by_customer'
  | 'expired_no_response' | 'expired_not_collected';      // the last two are used by Step 9e

const clock = (d: Date | string) =>
  new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' });

// Inbox row + one push delivery per registered device
async function toCustomer(c: PoolClient, customerId: string, reservationId: string, type: string, msg: Msg, data: object) {
  const { rows: [n] } = await c.query(
    `INSERT INTO notifications (recipient_type, customer_id, reservation_id, type, title, body, data)
     VALUES ('customer', $1, $2, $3, $4, $5, $6) RETURNING id`,
    [customerId, reservationId, type, msg.title, msg.body, JSON.stringify(data)]
  );
  const push = msg.push ?? { title: msg.title, body: 'Open the app for details.' };
  await c.query(
    `INSERT INTO notification_deliveries (notification_id, channel, target, payload)
     SELECT $1, 'push', t.token, $2::jsonb FROM push_tokens t WHERE t.customer_id = $3`,
    [n.id, JSON.stringify({ title: push.title, body: push.body, data }), customerId]
  );
}

// Record + one Telegram delivery per linked chat
async function toPharmacy(c: PoolClient, pharmacyId: string, reservationId: string | null, type: string, msg: Msg, data: object) {
  const { rows: [n] } = await c.query(
    `INSERT INTO notifications (recipient_type, pharmacy_id, reservation_id, type, title, body, data)
     VALUES ('pharmacy', $1, $2, $3, $4, $5, $6) RETURNING id`,
    [pharmacyId, reservationId, type, msg.title, msg.body, JSON.stringify(data)]
  );
  const text = msg.telegram ?? `${msg.title}. Open the dashboard for details.`;
  await c.query(
    `INSERT INTO notification_deliveries (notification_id, channel, target, payload)
     SELECT $1, 'telegram', l.chat_id::text, $2::jsonb FROM telegram_links l WHERE l.pharmacy_id = $3`,
    [n.id, JSON.stringify({ text }), pharmacyId]
  );
}

// Call this right after recording a reservation event, in the SAME transaction.
export async function notifyReservation(c: PoolClient, reservationId: string, event: ReservationEvent) {
  const { rows: [r] } = await c.query(
    `SELECT r.id, r.code, r.qty, r.customer_id, r.pharmacy_id, r.pickup_by, r.decline_reason,
            m.brand_name, m.strength, p.name AS pharmacy_name
       FROM reservations r
       JOIN medicines m ON m.id = r.medicine_id
       JOIN pharmacies p ON p.id = r.pharmacy_id
      WHERE r.id = $1`,
    [reservationId]
  );
  if (!r) return;

  const item = `${r.qty} × ${r.brand_name} ${r.strength}`;
  const ph = r.pharmacy_name;
  const data = { reservationId: r.id, event };
  const customer = (type: string, msg: Msg) => toCustomer(c, r.customer_id, r.id, type, msg, data);
  const pharmacy = (type: string, msg: Msg) => toPharmacy(c, r.pharmacy_id, r.id, type, msg, data);

  switch (event) {
    case 'requested':
      return pharmacy('reservation_requested', {
        title: 'New reservation request',
        body: `${item}. Please respond within ${R.respondMinutes} minutes.`,
        telegram: `🔔 New reservation request at ${ph}. Open the dashboard and respond within ${R.respondMinutes} minutes.`,
      });

    case 'confirmed':
      return customer('reservation_confirmed', {
        title: 'Reservation confirmed',
        body: `${ph} confirmed ${item}. Collect it before ${clock(r.pickup_by)} and show your code ${r.code}.`,
        push: { title: 'Reservation confirmed', body: 'Open the app for your pickup details.' },
      });

    case 'declined': {
      const why = r.decline_reason === 'out_of_stock' ? `no longer has ${item} in stock`
                : r.decline_reason === 'closed'       ? 'is closed'
                :                                       `could not prepare ${item}`;
      return customer('reservation_declined', {
        title: 'Reservation declined',
        body: `${ph} ${why}. You can search for another pharmacy.`,
        push: { title: 'Reservation declined', body: 'Open the app to find another pharmacy.' },
      });
    }

    case 'cancelled_by_customer':
      return pharmacy('reservation_cancelled', {
        title: 'Reservation cancelled',
        body: `${item} was cancelled by the customer. The stock is available again.`,
        telegram: `ℹ️ A reservation at ${ph} was cancelled by the customer.`,
      });

    case 'expired_no_response':
      await customer('reservation_expired', {
        title: 'Reservation expired',
        body: `${ph} did not respond in time, so your hold on ${item} was released. You can search for another pharmacy.`,
        push: { title: 'Reservation expired', body: 'The pharmacy did not respond. Open the app to try another.' },
      });
      return pharmacy('reservation_missed', {
        title: 'Missed reservation request',
        body: `A request for ${item} expired because nobody responded.`,
        telegram: `⚠️ A reservation request at ${ph} expired without a response.`,
      });

    case 'expired_not_collected':
      await customer('reservation_expired', {
        title: 'Reservation expired',
        body: `Your reservation of ${item} at ${ph} was not collected in time and has been released.`,
        push: { title: 'Reservation expired', body: 'Your reservation was not collected in time.' },
      });
      return pharmacy('reservation_not_collected', {
        title: 'Reservation not collected',
        body: `${item} was not collected. The stock is available again.`,
        telegram: `ℹ️ A reservation at ${ph} was not collected and has been released.`,
      });
  }
}

// "Is Telegram set up correctly?" button
export async function notifyPharmacyTest(c: PoolClient, pharmacyId: string) {
  await toPharmacy(c, pharmacyId, null, 'test', {
    title: 'Test alert',
    body: 'Alerts are working.',
    telegram: '✅ Test alert: reservation alerts are working for your pharmacy.',
  }, {});
}