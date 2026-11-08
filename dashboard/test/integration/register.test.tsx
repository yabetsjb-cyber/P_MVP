import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import RegisterPage from '@/pages/register';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { routerMocks } from '../setup';
import { verifiedUser } from '../mocks/handlers';

const API = 'http://localhost:3000';

const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const fillValidForm = async (email = 'new@test.com') => {
  await userEvent.type(await screen.findByLabelText(/your name/i), 'Test Owner');
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
};

describe('RegisterPage', () => {
  it('submits valid form and redirects to /pending after auth flips to no-pharmacy', async () => {
    let registered = false;

    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        registered
          ? HttpResponse.json({ user: { ...verifiedUser, pharmacyId: null } })
          : HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(`${API}/v1/auth/register`, async ({ request }) => {
        const body = (await request.json()) as { email: string };
        if (body.email === 'taken@test.com') {
          return HttpResponse.json({ error: 'EMAIL_IN_USE' }, { status: 409 });
        }
        registered = true;
        return HttpResponse.json(
          { user: { ...verifiedUser, pharmacyId: null } },
          { status: 201 },
        );
      }),
    );

    renderPage();
    await fillValidForm('new@test.com');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith('/pending');
    });
  });

  it('shows inline error on duplicate email (409 EMAIL_IN_USE)', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(`${API}/v1/auth/register`, () =>
        HttpResponse.json({ error: 'EMAIL_IN_USE' }, { status: 409 }),
      ),
    );

    renderPage();
    await fillValidForm('taken@test.com');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/this email is already registered/i),
    ).toBeInTheDocument();
  });

  it('shows inline field error on 422 validation', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(`${API}/v1/auth/register`, () =>
        HttpResponse.json(
          {
            error: 'VALIDATION',
            fields: { password: 'Password must be at least 10 characters' },
          },
          { status: 422 },
        ),
      ),
    );

    renderPage();
    await fillValidForm('new@test.com');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/must be at least 10 characters/i),
    ).toBeInTheDocument();
  });
});