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