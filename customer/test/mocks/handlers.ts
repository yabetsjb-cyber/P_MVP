import { http, HttpResponse } from 'msw';

const API = 'http://localhost:3000';

export const testCustomer = {
  id: 'cust-1',
  email: 'buyer@example.com',
  fullName: 'Selam T.',
  phone: '+251911234567',
};

/**
 * Default handlers assume "unauthenticated" — /me returns 401.
 * Tests that want a logged-in state call server.use(...) to override.
 */
export const handlers = [
  http.get(`${API}/v1/customer/me`, () =>
    HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
  ),
  http.post(`${API}/v1/customer/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'buyer@example.com' && body.password === 'correct-horse-battery') {
      return HttpResponse.json({ customer: testCustomer });
    }
    return HttpResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }),
  http.post(`${API}/v1/customer/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string };
    if (body.email === 'taken@example.com') {
      return HttpResponse.json({ error: 'EMAIL_IN_USE' }, { status: 409 });
    }
    return HttpResponse.json({ customer: { ...testCustomer, email: body.email } }, { status: 201 });
  }),
  http.post(`${API}/v1/customer/auth/logout`, () => HttpResponse.json({ ok: true })),
];

export const authenticatedHandlers = [
  http.get(`${API}/v1/customer/me`, () =>
    HttpResponse.json({ customer: testCustomer }),
  ),


];

export const searchHandlers = [
  http.get(`${API}/v1/search`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';

    if (q === 'zzzznomatch') {
      return HttpResponse.json({
        query: { text: q, strength: null },
        searchedRadiusMeters: 5000,
        canWiden: true,
        notice: null,
        medicines: [],
        unavailable: [],
      });
    }

    if (q === 'unavailable') {
      return HttpResponse.json({
        query: { text: q, strength: null },
        searchedRadiusMeters: 5000,
        canWiden: true,
        notice: null,
        medicines: [],
        unavailable: [
          {
            id: 'med-x',
            brandName: 'Unavailable',
            genericName: 'Unavailable',
            strength: '500mg',
          },
        ],
      });
    }

    if (q === 'restricted') {
      return HttpResponse.json({
        query: { text: q, strength: null },
        searchedRadiusMeters: 5000,
        canWiden: true,
        notice: { code: 'RESTRICTED_MEDICINE', message: 'Not listed online' },
        medicines: [],
        unavailable: [],
      });
    }

    return HttpResponse.json({
      query: { text: q, strength: null },
      searchedRadiusMeters: 5000,
      canWiden: true,
      notice: null,
      medicines: [
        {
          id: 'med-amoxil',
          brandName: 'Amoxil',
          genericName: 'Amoxicillin',
          strength: '500mg',
          dosageForm: 'capsule',
          packSize: '16 caps',
          rxStatus: 'RX',
          requiresPrescription: true,
          moreNearby: 0,
          pharmacies: [
            {
              pharmacyId: 'ph-abeba',
              inventoryId: 'inv-1',
              name: 'Abeba Pharmacy',
              address: 'Bole Road',
              subcity: 'Bole',
              phone: '+251911234567',
              openingHours: null,
              lat: 9.0107,
              lng: 38.7869,
              distanceMeters: 320,
              stockLevel: 'ok',
              maxReservable: 10,
              updatedAt: '2026-11-15T12:00:00.000Z',
              freshness: 'updated 1h ago',
            },
            {
              pharmacyId: 'ph-marta',
              inventoryId: 'inv-2',
              name: 'Marta Pharmacy',
              address: 'Kazanchis',
              subcity: 'Kirkos',
              phone: '+251911987654',
              openingHours: null,
              lat: 9.02,
              lng: 38.79,
              distanceMeters: 1150,
              stockLevel: 'low',
              maxReservable: 3,
              updatedAt: '2026-11-15T11:00:00.000Z',
              freshness: 'updated 2h ago',
            },
          ],
        },
      ],
      unavailable: [],
    });
  }),
];

export const allHandlers = [...handlers, ...searchHandlers];



