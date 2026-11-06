import 'dotenv/config';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

// Key for the daily search-session hash. Never commit it.
function analyticsSecret(): string {
  const s = process.env.ANALYTICS_SECRET;
  if (s) return s;
  if (isProd) throw new Error('ANALYTICS_SECRET must be set in production');
  return randomBytes(32).toString('hex'); // dev: a new secret on every restart is fine
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  cookieName: 'sid',
  sessionDays: 7,
  customerSessionDays: 30,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001')
    .split(',')
    .map((s) => s.trim()),
  documentsDir: path.resolve(process.env.STORAGE_DIR ?? './storage', 'documents'),
  analyticsSecret: analyticsSecret(),

  // Search tuning: change numbers here, not in the code
  search: {
    defaultRadiusM: 3000,
    maxRadiusM: 20000,
    minDaysBeforeExpiry: 60,   // hide stock expiring sooner than this
    stockMaxAgeDays: 30,       // hide stock not updated for this long
    maxMedicines: 10,          // medicines per search
    perMedicinePharmacies: 10, // pharmacies listed under each medicine
    lowStockAt: 5,             // "low" at or below this many units
    maxReservable: 10,         // most units one reservation can ask for
    confidentMatch: 0.45,      // below this the query is treated as an unknown name
  },

    reservation: {

    respondMinutes: 10,        // how long the pharmacy has to answer a request
    pickupHours: 20,            // time to collect after the pharmacy confirms
    maxActivePerCustomer: 4,
    pickupGraceMinutes: 10,    // a late customer is not a no-show until this much later
    sweepSeconds: Number(process.env.SWEEP_SECONDS ?? 30),   // how often the worker looks for overdue reservations

  },

  // 3 uncollected reservations within 30 days pauses reserving for 7 days
  noShow: { windowDays: 30, strikesToSuspend: 3, suspendDays: 7 },

  // How long old data is kept before the cleanup job deletes it
  retention: { notificationsDays: 90, deliveriesDays: 30, searchEventsDays: 395, importRowsDays: 30 },

    telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, ''),
    maxLinksPerPharmacy: 5,
    linkTokenMinutes: 10,
  },

  push: {
    provider: process.env.PUSH_PROVIDER ?? 'console',          // 'console' or 'fcm'
    fcmServiceAccountFile: process.env.FCM_SERVICE_ACCOUNT_FILE ?? '',
  },
};
