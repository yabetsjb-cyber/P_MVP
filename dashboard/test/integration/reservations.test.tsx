import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import ReservationsPage from '@/pages/reservations';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { reservationFixtures } from '../mocks/handlers';

const API = 'http://localhost:3000';

const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <ReservationsPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

describe('ReservationsPage', () => {
  // ---- From 11.3b ----

  it('shows the New tab with pending reservations by default', async () => {
    renderPage();
    expect(await screen.findByText('Amoxil')).toBeInTheDocument();
    expect(screen.getByText('Selam T.')).toBeInTheDocument();
    expect(screen.getByText('+251911234567')).toBeInTheDocument();
    expect(screen.queryByText('Panadol')).not.toBeInTheDocument();
  });

  it('switches to the Active tab when clicked', async () => {
    renderPage();
    await screen.findByText('Amoxil');

    await userEvent.click(screen.getByRole('tab', { name: /^active$/i }));

    expect(await screen.findByText('Panadol')).toBeInTheDocument();
    expect(screen.getByText('Dawit M.')).toBeInTheDocument();
    expect(screen.queryByText('Amoxil')).not.toBeInTheDocument();
  });

  it('shows empty state per tab when there are no reservations', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/reservations`, () =>
        HttpResponse.json({ reservations: [] }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText(/no new reservations/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/new requests from customers will appear here/i),
    ).toBeInTheDocument();
  });

  it('shows the qty, Rx badge, and respond deadline for a pending reservation', async () => {
    renderPage();
    await screen.findByText('Amoxil');

    expect(screen.getByText(/qty 2/i)).toBeInTheDocument();
    expect(screen.getByText(/rx required/i)).toBeInTheDocument();
    expect(screen.getByText(/respond by/i)).toBeInTheDocument();
  });

  // ---- From 11.3c ----

  it('opens the confirm dialog when Confirm is clicked', async () => {
    renderPage();
    await screen.findByText('Amoxil');

    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/confirm reservation/i)).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText(/amoxil/i),
    ).toBeInTheDocument();
  });

  it('cancels the dialog without sending a request', async () => {
    let posted = false;
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/:id/confirm`, () => {
        posted = true;
        return HttpResponse.json({ reservation: {} });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^cancel$/i }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('sends POST confirm with default holdMinutes=120 on submit', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${API}/v1/pharmacy/reservations/:id/confirm`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({
            reservation: { ...reservationFixtures.pending, status: 'confirmed' },
          });
        },
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^confirm$/i }),
    );

    await waitFor(() => {
      expect(captured).toEqual({ holdMinutes: 120 });
    });
  });

  it('sends the chosen pickup window when changed', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${API}/v1/pharmacy/reservations/:id/confirm`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({
            reservation: { ...reservationFixtures.pending, status: 'confirmed' },
          });
        },
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), '240');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^confirm$/i }),
    );

    await waitFor(() => {
      expect(captured).toEqual({ holdMinutes: 240 });
    });
  });

  it('shows inline error when server returns RESPONSE_WINDOW_PASSED', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/:id/confirm`, () =>
        HttpResponse.json(
          { error: 'RESPONSE_WINDOW_PASSED' },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^confirm$/i }),
    );

    expect(
      await screen.findByText(/response window has already passed/i),
    ).toBeInTheDocument();
    // Dialog stays open so the pharmacist can see the error
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});