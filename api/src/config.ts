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
    respondMinutes: 15,        // how long the pharmacy has to answer a request
    pickupHours: 2,            // time to collect after the pharmacy confirms (used in 9c)
    maxActivePerCustomer: 2,
  },
};