import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import SuspendedPage from '@/pages/suspended';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { routerMocks } from '../setup';
import {
  verifiedUser,
  verifiedPharmacy,
  suspendedPharmacy,
} from '../mocks/handlers';

const API = 'http://localhost:3000';

const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <SuspendedPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

describe('SuspendedPage', () => {
  it('shows pharmacy name, reason card, and contact support when suspended', async () => {
    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ user: verifiedUser }),
      ),
      http.get(`${API}/v1/pharmacy/me`, () =>
        HttpResponse.json(suspendedPharmacy),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /account suspended/i }),
    ).toBeInTheDocument();
    // Pharmacy name (from suspendedPharmacy fixture)
    expect(screen.getByText(/abeba pharmacy/i)).toBeInTheDocument();
    // Reason label + value
    expect(screen.getByText(/^reason$/i)).toBeInTheDocument();
    expect(screen.getByText(/license expired/i)).toBeInTheDocument();
       // Contact support footer (specific to the new footer message, not the body)
    expect(
      screen.getByText(/contact support if you believe this is a mistake/i),
    ).toBeInTheDocument();
  });

  it('shows the same page for rejected status (with its own reason)', async () => {
    const rejectedPharmacy = {
      ...suspendedPharmacy,
      pharmacy: {
        ...suspendedPharmacy.pharmacy,
        status: 'rejected' as const,
        status_reason: 'Invalid license document',
      },
    };

    server.use(
      http.get(`${API}/v1/auth/me`, () =>
        HttpResponse.json({ user: verifiedUser }),
      ),
      http.get(`${API}/v1/pharmacy/me`, () =>
        HttpResponse.json(rejectedPharmacy),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /account suspended/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/invalid license document/i),
    ).toBeInTheDocument();
  });

  it('redirects verified users to /reservations', async () => {
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