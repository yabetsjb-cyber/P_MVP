import { http, HttpResponse } from 'msw';

const API = 'http://localhost:3000';

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

type AuthState = 'authenticated' | 'unauthenticated' | 'pending' | 'suspended';

/**
 * Default handlers assume "verified, authenticated" so tests that want a
 * different state call `server.use(...)` to override.
 */
export const handlers = [
  http.get(`${API}/v1/auth/me`, () =>
    HttpResponse.json({ user: verifiedUser }),
  ),

  http.get(`${API}/v1/pharmacy/me`, () =>
    HttpResponse.json(verifiedPharmacy),
  ),

  http.post(`${API}/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'owner@test.com' && body.password === 'correct-horse-battery') {
      return HttpResponse.json({ user: verifiedUser });
    }
    return HttpResponse.json(
      { error: 'INVALID_CREDENTIALS' },
      { status: 401 },
    );
  }),

  http.post(`${API}/v1/auth/logout`, () =>
    HttpResponse.json({ ok: true }),
  ),

      http.get(`${API}/v1/pharmacy/inventory`, () =>
    HttpResponse.json({
      total: inventoryItems.length,
      items: inventoryItems,
    }),
  ),
];
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





/** Helpers used by tests to switch the state of the mock API. */
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