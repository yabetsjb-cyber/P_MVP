import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import HomePage from '@/pages/index';
import { AuthProvider } from '@/context/AuthContext';
import { server } from '../mocks/server';
import { authenticatedHandlers } from '../mocks/handlers';
import { routerMocks } from '../setup';

const API = 'http://localhost:3000';

vi.mock('@/components/MapView', () => ({
  MapView: ({ pharmacies }: { pharmacies: Array<{ pharmacyId: string }> }) => (
    <div data-testid="map-view">
      {pharmacies.length} {pharmacies.length === 1 ? 'pin' : 'pins'}
    </div>
  ),
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <HomePage />
      </AuthProvider>
    </QueryClientProvider>,
  );
};

const openReserveModal = async () => {
  await userEvent.type(
    await screen.findByPlaceholderText(/search medicine/i),
    'amoxil',
  );
  await userEvent.click(
    await screen.findByRole('button', { name: /abeba pharmacy/i }),
  );
  const reserveButtons = await screen.findAllByRole('button', { name: /^reserve$/i });
  await userEvent.click(reserveButtons[0]);
  await screen.findByRole('dialog');
};

describe('ReserveModal', () => {
  beforeEach(() => {
    // Authenticate the customer so the Confirm button is enabled
    // (it is disabled when there is no phone number to send the code to).
    server.use(...authenticatedHandlers);
  });

  it('opens with quantity default of 1', async () => {
    renderPage();
    await openReserveModal();

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /reserve medicine/i }),
    ).toBeInTheDocument();
    // The quantity counter is the only element with text "1"
    expect(within(dialog).getByText('1')).toBeInTheDocument();
  });

  it('increase/decrease buttons respect maxReservable', async () => {
    renderPage();
    await openReserveModal();
    const dialog = screen.getByRole('dialog');
    const minus = within(dialog).getByRole('button', { name: /decrease quantity/i });
    const plus = within(dialog).getByRole('button', { name: /increase quantity/i });
    expect(minus).toBeDisabled();
    for (let i = 0; i < 9; i++) {
      await userEvent.click(plus);
    }
    expect(plus).toBeDisabled();
  });

  it('submit POSTs the correct payload with inventoryId and qty', async () => {
    let captured: unknown = null;
    server.use(
      http.post(`${API}/v1/customer/reservations`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(
          {
            reservation: {
              id: 'res-1',
              code: 'K7M2QD',
              status: 'requested',
              qty: 2,
              respondBy: new Date(Date.now() + 20 * 60_000).toISOString(),
              pickupBy: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
              createdAt: new Date().toISOString(),
              medicine: {
                brandName: 'Amoxil',
                genericName: 'Amoxicillin',
                strength: '500mg',
                packSize: '16 caps',
              },
              pharmacy: {
                name: 'Abeba Pharmacy',
                address: 'Bole Road',
                subcity: 'Bole',
                phone: '+251911234567',
              },
            },
          },
          { status: 201 },
        );
      }),
    );

    renderPage();
    await openReserveModal();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity/i }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /confirm reservation/i }),
    );

    await waitFor(() => {
      expect(captured).toEqual({ inventoryId: 'inv-1', qty: 2 });
    });
  });

  it('success screen shows the pickup code', async () => {
    renderPage();
    await openReserveModal();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /confirm reservation/i }),
    );

    expect(await screen.findByText('K7M2QD')).toBeInTheDocument();
    expect(screen.getByText(/reserved!/i)).toBeInTheDocument();
  });

  it('success screen falls back to SMS message when code is missing', async () => {
    server.use(
      http.post(`${API}/v1/customer/reservations`, () =>
        HttpResponse.json(
          {
            reservation: {
              id: 'res-1',
              status: 'requested',
              qty: 1,
              respondBy: new Date(Date.now() + 20 * 60_000).toISOString(),
              pickupBy: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
              createdAt: new Date().toISOString(),
              medicine: {
                brandName: 'Amoxil',
                genericName: 'Amoxicillin',
                strength: '500mg',
                packSize: '16 caps',
              },
              pharmacy: {
                name: 'Abeba Pharmacy',
                address: 'Bole Road',
                subcity: 'Bole',
                phone: '+251911234567',
              },
            },
          },
          { status: 201 },
        ),
      ),
    );

    renderPage();
    await openReserveModal();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /confirm reservation/i }),
    );

    expect(
      await screen.findByText(/we've sent your pickup code by sms/i),
    ).toBeInTheDocument();
  });

  it('shows inline error on 409 QUANTITY_UNAVAILABLE', async () => {
    server.use(
      http.post(`${API}/v1/customer/reservations`, () =>
        HttpResponse.json({ error: 'QUANTITY_UNAVAILABLE' }, { status: 409 }),
      ),
    );

    renderPage();
    await openReserveModal();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /confirm reservation/i }),
    );

    expect(await screen.findByText(/not enough stock/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('"View all reservations" navigates to /reservations', async () => {
    renderPage();
    await openReserveModal();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /confirm reservation/i }),
    );
    await screen.findByText('K7M2QD');

    await userEvent.click(
      screen.getByRole('button', { name: /view all reservations/i }),
    );

    await waitFor(() => {
      expect(routerMocks.push).toHaveBeenCalledWith('/reservations');
    });
  });
});