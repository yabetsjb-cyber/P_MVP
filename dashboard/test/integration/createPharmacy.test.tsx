import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import PendingPage from '@/pages/pending';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { routerMocks } from '../setup';
import {
  verifiedUser,
  verifiedPharmacy,
  pendingPharmacy,
} from '../mocks/handlers';

const API = 'http://localhost:3000';

const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <PendingPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const fillValidForm = async () => {
  await userEvent.type(
    await screen.findByLabelText(/pharmacy name/i),
    'Test Pharmacy',
  );
  await userEvent.type(
    screen.getByLabelText(/license number/i),
    'LIC-ABC-001',
  );
  await userEvent.type(
    screen.getByLabelText(/license expiry date/i),
    '2027-12-31',
  );
  await userEvent.type(
    screen.getByLabelText(/pharmacy phone/i),
    '0911234567',
  );
};

describe('PendingPage — create-pharmacy flow', () => {
  it('shows create-pharmacy form when user has no pharmacy', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ user: { ...verifiedUser, pharmacyId: null } }),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: /tell us about your pharmacy/i,
      }),
    ).toBeInTheDocument();
  });

  it('submits form, sends Addis coordinates, and shows waiting screen after success', async () => {
    let pharmacyCreated = false;

    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({
          user: {
            ...verifiedUser,
            pharmacyId: pharmacyCreated
              ? pendingPharmacy.pharmacy.id
              : null,
          },
        }),
      ),
      http.get(`${API}/v1/pharmacy/me`, () => {
        if (!pharmacyCreated) {
          return HttpResponse.json({ error: 'NO_PHARMACY' }, { status: 409 });
        }
        return HttpResponse.json(pendingPharmacy);
      }),
      http.post(`${API}/v1/pharmacy/register`, async ({ request }) => {
        const body = (await request.json()) as {
          name: string;
          licenseNo: string;
          lat: number;
          lng: number;
        };
        // Verify the pre-filled Addis coordinates are sent (decision D)
        expect(body.lat).toBe(9.0107);
        expect(body.lng).toBe(38.7869);
        pharmacyCreated = true;
        return HttpResponse.json(
          {
            pharmacy: {
              id: pendingPharmacy.pharmacy.id,
              name: body.name,
              license_no: body.licenseNo,
              status: 'pending',
            },
          },
          { status: 201 },
        );
      }),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(
      screen.getByRole('button', { name: /submit for verification/i }),
    );

    // After success → refetch → /me returns pharmacyId → /pharmacy/me returns pending
    // → status flips from 'no-pharmacy' to 'pending' → waiting screen appears
    expect(
      await screen.findByRole('heading', {
        name: /verification in progress/i,
      }),
    ).toBeInTheDocument();
  });

  it('shows inline error on 409 LICENSE_ALREADY_REGISTERED', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ user: { ...verifiedUser, pharmacyId: null } }),
      ),
      http.post(`${API}/v1/pharmacy/register`, () =>
        HttpResponse.json(
          { error: 'LICENSE_ALREADY_REGISTERED' },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(
      screen.getByRole('button', { name: /submit for verification/i }),
    );

    expect(
      await screen.findByText(/this license is already registered/i),
    ).toBeInTheDocument();
  });

  it('redirects to /reservations when status is verified', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ user: verifiedUser }),
      ),
      http.get(`${API}/v1/pharmacy/me`, () =>
        HttpResponse.json(verifiedPharmacy),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith('/reservations');
    });
  });
});