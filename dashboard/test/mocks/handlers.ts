import { http, HttpResponse } from 'msw';

const API = 'http://localhost:3000';

// ============================================================
// Fixtures — pharmacy and auth
// ============================================================

export const verifiedPharmacy = {
  pharmacy: {
    id: 'a8c50790-068b-4d58-856d-31350fb6c2d8',
    name: 'Abeba Pharmacy',
    license_no: 'LIC-TEST-001',
    license_expires_on: '2027-06-30',
    status: 'verified' as const,
    status_reason: null,
    phone: '+251911234567',
    address: 'Bole Road',
    subcity: 'Bole',
    lat: 9.0107,
    lng: 38.7869,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  documents: [],
};

export const pendingPharmacy = {
  ...verifiedPharmacy,
  pharmacy: { ...verifiedPharmacy.pharmacy, status: 'pending' as const },
};

export const suspendedPharmacy = {
  ...verifiedPharmacy,
  pharmacy: {
    ...verifiedPharmacy.pharmacy,
    status: 'suspended' as const,
    status_reason: 'License expired',
  },
};

export const verifiedUser = {
  id: '1a0b9b8b-67b9-41e6-a40b-9e8b742225c4',
  email: 'owner@test.com',
  fullName: 'Test Owner',
  role: 'pharmacy_owner' as const,
  pharmacyId: 'a8c50790-068b-4d58-856d-31350fb6c2d8',
};

// ============================================================
// Fixtures — inventory
// ============================================================

export const inventoryItems = [
  {
    id: 'inv-1',
    medicine_id: 'med-amoxil',
    brand_name: 'Amoxil',
    generic_name: 'Amoxicillin',
    strength: '500mg',
    pack_size: '16 caps',
    rx_status: 'RX' as const,
    qty_on_hand: 10,
    qty_reserved: 0,
    available: 10,
    expiry_date: '2027-12-10T21:00:00.000Z',
    is_out_of_stock: false,
    updated_at: '2026-11-06T12:35:15.815Z',
    expiring_soon: false,
  },
  {
    id: 'inv-2',
    medicine_id: 'med-augmentin',
    brand_name: 'Augmentin',
    generic_name: 'Amoxicillin/Clavulanate',
    strength: '625mg',
    pack_size: '14 tabs',
    rx_status: 'RX' as const,
    qty_on_hand: 25,
    qty_reserved: 0,
    available: 25,
    expiry_date: '2027-12-30T21:00:00.000Z',
    is_out_of_stock: false,
    updated_at: '2026-10-27T20:14:16.733Z',
    expiring_soon: false,
  },
  {
    id: 'inv-3',
    medicine_id: 'med-panadol',
    brand_name: 'Panadol',
    generic_name: 'Paracetamol',
    strength: '500mg',
    pack_size: '24 tabs',
    rx_status: 'OTC' as const,
    qty_on_hand: 3,
    qty_reserved: 0,
    available: 3,
    expiry_date: '2027-12-10T21:00:00.000Z',
    is_out_of_stock: false,
    updated_at: '2026-11-06T12:35:15.815Z',
    expiring_soon: false,
  },
  {
    id: 'inv-4',
    medicine_id: 'med-ventolin',
    brand_name: 'Ventolin',
    generic_name: 'Salbutamol',
    strength: '100mcg',
    pack_size: '200 doses',
    rx_status: 'RX' as const,
    qty_on_hand: 5,
    qty_reserved: 0,
    available: 5,
    expiry_date: '2027-12-10T21:00:00.000Z',
    is_out_of_stock: false,
    updated_at: '2026-11-06T12:35:15.815Z',
    expiring_soon: false,
  },
];

// ============================================================
// Fixtures — reservations
// ============================================================

export const reservationFixtures = {
  pending: {
    id: 'res-1',
    status: 'requested' as const,
    qty: 2,
    requiresPrescription: true,
    respondBy: new Date(Date.now() + 15 * 60_000).toISOString(),
    pickupBy: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    confirmedAt: null,
    fulfilledAt: null,
    closedAt: null,
    declineReason: null,
    closedReason: null,
    medicine: {
      id: 'med-amoxil',
      brandName: 'Amoxil',
      genericName: 'Amoxicillin',
      strength: '500mg',
      packSize: '16 caps',
    },
    customer: {
      name: 'Selam T.',
      phone: '+251911234567',
      phoneVerified: false,
      noShowCount: 0,
    },
  },
  confirmed: {
    id: 'res-2',
    status: 'confirmed' as const,
    qty: 1,
    requiresPrescription: false,
    respondBy: new Date(Date.now() - 10 * 60_000).toISOString(),
    pickupBy: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    confirmedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    fulfilledAt: null,
    closedAt: null,
    declineReason: null,
    closedReason: null,
    medicine: {
      id: 'med-panadol',
      brandName: 'Panadol',
      genericName: 'Paracetamol',
      strength: '500mg',
      packSize: '24 tabs',
    },
    customer: {
      name: 'Dawit M.',
      phone: '+251911987654',
      phoneVerified: false,
      noShowCount: 1,
    },
  },
};

// ============================================================
// Handlers
// ============================================================

/**
 * Default handlers assume "verified, authenticated" so tests that want a
 * different state call `server.use(...)` to override.
 */
export const handlers = [
  // ---- Auth ----
  http.get(`${API}/v1/auth/me`, () =>
    HttpResponse.json({ user: verifiedUser }),
  ),
  http.post(`${API}/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'owner@test.com' && body.password === 'correct-horse-battery') {
      return HttpResponse.json({ user: verifiedUser });
    }
    return HttpResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }),
  http.post(`${API}/v1/auth/logout`, () =>
    HttpResponse.json({ ok: true }),
  ),

  // ---- Pharmacy ----
  http.get(`${API}/v1/pharmacy/me`, () =>
    HttpResponse.json(verifiedPharmacy),
  ),
  http.get(`${API}/v1/pharmacy/inventory`, () =>
    HttpResponse.json({
      total: inventoryItems.length,
      items: inventoryItems,
    }),
  ),


  http.post(`${API}/v1/pharmacy/imports`, async ({ request }) => {
    const url = new URL(request.url);
    const mode = (url.searchParams.get('mode') ?? 'update') as 'update' | 'sync';
    return HttpResponse.json(
      {
        import: {
          id: 'imp-1',
          filename: 'inventory.csv',
          mode,
          totalRows: 10,
          okRows: 7,
          errorRows: 2,
          unmatchedRows: 1,
          productsToUpdate: 6,
          mergedRows: 1,
          willMarkOutOfStock: mode === 'sync' ? 3 : null,
          ignoredColumns: [],
          expiresInHours: 24,
        },
        canCommit: mode === 'update' || (mode === 'sync' && false),
        requiresAcceptSkipped: true,
        syncBlockedReason:
          mode === 'sync'
            ? 'Fix every error and unmatched row first.'
            : null,
        problems: [
          {
            row_number: 3,
            status: 'error',
            raw: { brand_name: 'x' },
            errors: [{ field: 'quantity', message: 'Must be a whole number' }],
            warnings: [],
            medicine_id: null,
            quantity: null,
            expiry_date: null,
            suggestions: null,
          },
          {
            row_number: 8,
            status: 'unmatched',
            raw: { brand_name: 'Unknown' },
            errors: [],
            warnings: [],
            medicine_id: null,
            quantity: 5,
            expiry_date: null,
            suggestions: [
              {
                id: 'med-x',
                brand_name: 'Amoxil',
                generic_name: 'Amoxicillin',
                strength: '500mg',
                pack_size: '16 caps',
              },
            ],
          },
        ],
        problemsShown: 2,
        sample: [],
      },
      { status: 201 },
    );
  }),


    http.get(`${API}/v1/pharmacy/imports/:id/rows`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const allRows = [
      { row_number: 1, status: 'ok' as const, raw: { brand_name: 'Amoxil', strength: '500mg' }, errors: [], warnings: [], medicine_id: 'med-amoxil', quantity: 20, expiry_date: '2027-12-31', suggestions: null },
      { row_number: 2, status: 'ok' as const, raw: { brand_name: 'Panadol', strength: '500mg' }, errors: [], warnings: [], medicine_id: 'med-panadol', quantity: 30, expiry_date: '2027-12-31', suggestions: null },
      { row_number: 3, status: 'error' as const, raw: { brand_name: 'BadRow' }, errors: [{ field: 'quantity', message: 'Must be a whole number' }], warnings: [], medicine_id: null, quantity: null, expiry_date: null, suggestions: null },
      { row_number: 8, status: 'unmatched' as const, raw: { brand_name: 'UnknownDrug', strength: '10mg' }, errors: [], warnings: [], medicine_id: null, quantity: 5, expiry_date: null, suggestions: [{ id: 'med-x', brand_name: 'Amoxil', generic_name: 'Amoxicillin', strength: '500mg', pack_size: '16 caps' }] },
    ];
    const filtered = status ? allRows.filter((r) => r.status === status) : allRows;
    return HttpResponse.json({ rows: filtered });
  }),



    http.post(`${API}/v1/pharmacy/imports/:id/commit`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      acceptSkipped?: boolean;
      confirmOutOfStockCount?: number;
    };
    const markedOut =
      body.confirmOutOfStockCount !== undefined ? body.confirmOutOfStockCount : 0;
    return HttpResponse.json({
      committed: true,
      summary: {
        created: 3,
        updated: 5,
        markedOutOfStock: markedOut,
        skippedRows: body.acceptSkipped ? 2 : 0,
      },
    });


    







  }),


  // ---- Reservations: summary (badge, 11.3b) ----
  http.get(`${API}/v1/pharmacy/reservations/summary`, () =>
    HttpResponse.json({
      requested: 1,
      confirmed: 1,
      nextRespondBy: reservationFixtures.pending.respondBy,
      serverTime: new Date().toISOString(),
    }),
  ),

  // ---- Reservations: list (tabs, 11.3b) ----
  http.get(`${API}/v1/pharmacy/reservations`, ({ request }) => {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'active';
    const list =
      scope === 'pending'
        ? [reservationFixtures.pending]
        : scope === 'confirmed'
          ? [reservationFixtures.confirmed]
          : [reservationFixtures.pending, reservationFixtures.confirmed];
    return HttpResponse.json({ reservations: list });
  }),

  // ---- Reservations: confirm (11.3c) ----
  http.post(`${API}/v1/pharmacy/reservations/:id/confirm`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      holdMinutes?: number;
    };
    const mins = body.holdMinutes ?? 120;
    return HttpResponse.json({
      reservation: {
        ...reservationFixtures.pending,
        status: 'confirmed',
        pickupBy: new Date(Date.now() + mins * 60_000).toISOString(),
        confirmedAt: new Date().toISOString(),
      },
    });
  }),


    http.post(`${API}/v1/pharmacy/reservations/lookup`, async ({ request }) => {
    const body = (await request.json()) as { code: string };
    if (!body.code || body.code.length !== 6) {
      return HttpResponse.json({ error: 'INVALID_CODE' }, { status: 400 });
    }
    // Default: return the confirmed fixture. Tests override for other cases.
    return HttpResponse.json({
      reservation: reservationFixtures.confirmed,
      readyForPickup: true,
    });
  }),

    http.post(`${API}/v1/pharmacy/reservations/:id/decline`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      note?: string;
      alsoMarkOutOfStock?: boolean;
    };
    return HttpResponse.json({
      reservation: {
        ...reservationFixtures.pending,
        status: 'declined',
        declineReason: body.reason ?? 'out_of_stock',
        closedAt: new Date().toISOString(),
      },
      markedOutOfStock:
        body.reason === 'out_of_stock' && body.alsoMarkOutOfStock !== false,
    });
  }),

    http.post(`${API}/v1/pharmacy/reservations/:id/fulfil`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    if (!body.code) {
      return HttpResponse.json({ error: 'INVALID_CODE' }, { status: 400 });
    }
    return HttpResponse.json({
      reservation: {
        ...reservationFixtures.confirmed,
        status: 'fulfilled',
        fulfilledAt: new Date().toISOString(),
      },
    });
  }),


    http.get(`${API}/v1/pharmacy/telegram`, () =>
    HttpResponse.json({ botConfigured: true, links: [] }),
  ),

  http.post(`${API}/v1/pharmacy/telegram/link-token`, () =>
    HttpResponse.json({
      token: 'abc123token',
      url: 'https://t.me/MedFinderBot?start=abc123token',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
  ),

  http.delete(`${API}/v1/pharmacy/telegram/:chatId`, () =>
    HttpResponse.json({ ok: true }),
  ),

  http.post(`${API}/v1/pharmacy/telegram/test`, () =>
    HttpResponse.json({ queuedTo: 1 }),
  ),


];

// ============================================================
// Helpers
// ============================================================

type AuthState = 'authenticated' | 'unauthenticated' | 'pending' | 'suspended';

/**
 * Returns MSW handlers that override the defaults to simulate each auth state.
 * Usage in tests: `server.use(...mockAuth('suspended'));`
 */
export const mockAuth = (state: AuthState) => {
  switch (state) {
    case 'unauthenticated':
      return [
        http.get(`${API}/v1/auth/me`, () =>
          HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
        ),
      ];
    case 'pending':
      return [
        http.get(`${API}/v1/pharmacy/me`, () =>
          HttpResponse.json(pendingPharmacy),
        ),
      ];
    case 'suspended':
      return [
        http.get(`${API}/v1/pharmacy/me`, () =>
          HttpResponse.json(suspendedPharmacy),
        ),
      ];
    case 'authenticated':
      return [];
  }
};