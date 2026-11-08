import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/pages/login';
import { AuthProvider } from '@/context/AuthContext';
import { makeQueryClient } from '@/lib/queryClient';
import { LocaleProvider } from '@/context/LocaleContext';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';
import { routerMocks } from '../setup';
import { verifiedUser, verifiedPharmacy } from '../mocks/handlers';

const API = 'http://localhost:3000';

const renderPage = (Component: React.ComponentType) => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <Component />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

describe('LoginPage', () => {
  it('renders and submits credentials, redirects on success', async () => {
    // The mock session starts unauthenticated. A successful POST /login flips it.
    let authenticated = false;

    server.use(
      http.get(`${API}/v1/auth/me`, () => {
        if (authenticated) return HttpResponse.json({ user: verifiedUser });
        return HttpResponse.json(
          { error: 'UNAUTHENTICATED' },
          { status: 401 },
        );
      }),
      http.get(`${API}/v1/pharmacy/me`, () =>
        HttpResponse.json(verifiedPharmacy),
      ),
      http.post(`${API}/v1/auth/login`, async ({ request }) => {
        const body = (await request.json()) as {
          email: string;
          password: string;
        };
        if (
          body.email === 'owner@test.com' &&
          body.password === 'correct-horse-battery'
        ) {
          authenticated = true;
          return HttpResponse.json({ user: verifiedUser });
        }
        return HttpResponse.json(
          { error: 'INVALID_CREDENTIALS' },
          { status: 401 },
        );
      }),
    );

    renderPage(LoginPage);

    const email = await screen.findByLabelText(/email/i);
    const password = screen.getByLabelText(/password/i);
    const submit = screen.getByRole('button', { name: /sign in/i });

    await userEvent.type(email, 'owner@test.com');
    await userEvent.type(password, 'correct-horse-battery');
    await userEvent.click(submit);

    // After login → /me returns user → /pharmacy/me returns verified → status = 'verified'
    // → LoginPage's effect calls router.replace
    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalled();
    });
  });

  it('shows invalid credentials error on 401', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );

    renderPage(LoginPage);

    await userEvent.type(await screen.findByLabelText(/email/i), 'owner@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText(/email or password is incorrect/i),
    ).toBeInTheDocument();
  });

  it('shows rate-limit message with retry seconds', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(`${API}/v1/auth/login`, () =>
        HttpResponse.json(
          { error: 'RATE_LIMITED' },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    );

    renderPage(LoginPage);

    await userEvent.type(await screen.findByLabelText(/email/i), 'owner@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'whatever');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/30s/i)).toBeInTheDocument();
  });
});