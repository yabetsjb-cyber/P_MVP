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