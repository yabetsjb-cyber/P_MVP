import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import StockPage from '@/pages/stock';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { render, screen, waitFor, within } from '@testing-library/react';


const API = 'http://localhost:3000';

const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <StockPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

describe('StockPage', () => {
  it('renders all inventory items from the API', async () => {
    renderPage();
    expect(await screen.findByText('Amoxil')).toBeInTheDocument();
    expect(screen.getByText('Augmentin')).toBeInTheDocument();
    expect(screen.getByText('Panadol')).toBeInTheDocument();
    expect(screen.getByText('Ventolin')).toBeInTheDocument();
  });

  it('shows empty state when the API returns no items', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/inventory`, () =>
        HttpResponse.json({ total: 0, items: [] }),
      ),
    );
    renderPage();
    expect(
      await screen.findByText(/no items in stock yet/i),
    ).toBeInTheDocument();
  });

  it('filters visible rows by search query', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.type(
      screen.getByPlaceholderText(/search by brand/i),
      'panadol',
    );
    expect(screen.getByText('Panadol')).toBeInTheDocument();
    expect(screen.queryByText('Amoxil')).not.toBeInTheDocument();
    expect(screen.queryByText('Ventolin')).not.toBeInTheDocument();
  });

  it('shows no-results message when filter matches nothing', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.type(
      screen.getByPlaceholderText(/search by brand/i),
      'xyzzy',
    );
    expect(
      screen.getByText(/no items match your search/i),
    ).toBeInTheDocument();
  });
    it('opens edit mode with current values and closes on Cancel without sending a request', async () => {
    let patchCalled = false;
    server.use(
      http.patch(`${API}/v1/pharmacy/inventory/:id`, () => {
        patchCalled = true;
        return HttpResponse.json({ item: {} });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    await userEvent.click(editButtons[0]);

    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2027-12-10')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByDisplayValue('10')).not.toBeInTheDocument();
    expect(patchCalled).toBe(false);
  });

  it('saves an edited quantity and sends { quantity } to the API', async () => {
    let captured: unknown = null;
    server.use(
      http.patch(`${API}/v1/pharmacy/inventory/:id`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          item: {
            id: 'inv-1',
            medicine_id: 'med-amoxil',
            qty_on_hand: 20,
            qty_reserved: 0,
            available: 20,
            expiry_date: '2027-12-10T21:00:00.000Z',
            is_out_of_stock: false,
            updated_at: '2026-11-09T00:00:00.000Z',
          },
        });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const qtyInput = screen.getByDisplayValue('10');
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '20');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(captured).toEqual({ quantity: 20 });
    });
  });

  it('shows an inline error when the server rejects with BELOW_RESERVED', async () => {
    server.use(
      http.patch(`${API}/v1/pharmacy/inventory/:id`, () =>
        HttpResponse.json(
          {
            error: 'BELOW_RESERVED',
            reserved: 5,
            hint: 'Keep quantity at or above reserved.',
            id: 'inv-1',
          },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const qtyInput = screen.getByDisplayValue('10');
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '2');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(
      await screen.findByText(/cannot reduce below reserved/i),
    ).toBeInTheDocument();
  });


  it('shows mark-out and edit buttons on in-stock rows, no badge', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    expect(screen.queryByText(/^out of stock$/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBe(4);
    expect(screen.getAllByRole('button', { name: /mark out of stock/i }).length).toBe(4);
    expect(screen.queryByRole('button', { name: /^restore to stock$/i })).not.toBeInTheDocument();
  });

  it('shows restore button and badge on out-of-stock rows, no edit/mark-out', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/inventory`, () =>
        HttpResponse.json({
          total: 2,
          items: [
            {
              id: 'inv-1', medicine_id: 'med-amoxil',
              brand_name: 'Amoxil', generic_name: 'Amoxicillin',
              strength: '500mg', pack_size: '16 caps', rx_status: 'RX',
              qty_on_hand: 0, qty_reserved: 0, available: 0,
              expiry_date: '2027-12-10T21:00:00.000Z',
              is_out_of_stock: true,
              updated_at: '2026-11-06T12:35:15.815Z',
              expiring_soon: false,
            },
            {
              id: 'inv-2', medicine_id: 'med-panadol',
              brand_name: 'Panadol', generic_name: 'Paracetamol',
              strength: '500mg', pack_size: '24 tabs', rx_status: 'OTC',
              qty_on_hand: 3, qty_reserved: 0, available: 3,
              expiry_date: '2027-12-10T21:00:00.000Z',
              is_out_of_stock: false,
              updated_at: '2026-11-06T12:35:15.815Z',
              expiring_soon: false,
            },
          ],
        }),
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');

    expect(screen.getByText(/^out of stock$/i)).toBeInTheDocument();
    // Only the non-out-of-stock row has Edit + Mark out
    expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: /mark out of stock/i }).length).toBe(1);
    // Only the out-of-stock row has Restore
    expect(screen.getAllByRole('button', { name: /^restore to stock$/i }).length).toBe(1);
  });

  it('opens mark-out dialog with reserved warning, cancel sends no request', async () => {
    let putCalled = false;
    server.use(
      http.get(`${API}/v1/pharmacy/inventory`, () =>
        HttpResponse.json({
          total: 1,
          items: [{
            id: 'inv-1', medicine_id: 'med-amoxil',
            brand_name: 'Amoxil', generic_name: 'Amoxicillin',
            strength: '500mg', pack_size: '16 caps', rx_status: 'RX',
            qty_on_hand: 10, qty_reserved: 3, available: 7,
            expiry_date: '2027-12-10T21:00:00.000Z',
            is_out_of_stock: false,
            updated_at: '2026-11-06T12:35:15.815Z',
            expiring_soon: false,
          }],
        }),
      ),
      http.put(`${API}/v1/pharmacy/inventory/:id/out-of-stock`, () => {
        putCalled = true;
        return HttpResponse.json({ item: {}, activeReservedUnits: 3 });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /mark out of stock/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/3 reserved units will still be honoured/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(putCalled).toBe(false);
  });

  it('confirms mark out and calls PUT out-of-stock', async () => {
    let putPath = '';
    server.use(
      http.put(`${API}/v1/pharmacy/inventory/:id/out-of-stock`, ({ request }) => {
        putPath = new URL(request.url).pathname;
        return HttpResponse.json({ item: {}, activeReservedUnits: 0 });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getAllByRole('button', { name: /mark out of stock/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /mark out of stock/i }));

    await waitFor(() => {
      expect(putPath).toBe('/v1/pharmacy/inventory/inv-1/out-of-stock');
    });
  });

  it('opens restore dialog, submits PATCH with quantity, and closes on success', async () => {
    let patchBody: unknown = null;
    server.use(
      http.get(`${API}/v1/pharmacy/inventory`, () =>
        HttpResponse.json({
          total: 1,
          items: [{
            id: 'inv-1', medicine_id: 'med-amoxil',
            brand_name: 'Amoxil', generic_name: 'Amoxicillin',
            strength: '500mg', pack_size: '16 caps', rx_status: 'RX',
            qty_on_hand: 0, qty_reserved: 0, available: 0,
            expiry_date: '2027-12-10T21:00:00.000Z',
            is_out_of_stock: true,
            updated_at: '2026-11-06T12:35:15.815Z',
            expiring_soon: false,
          }],
        }),
      ),
      http.patch(`${API}/v1/pharmacy/inventory/:id`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ item: {} });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^restore to stock$/i }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('spinbutton');
    await userEvent.type(input, '15');
    await userEvent.click(within(dialog).getByRole('button', { name: /^restore$/i }));

    await waitFor(() => {
      expect(patchBody).toEqual({ quantity: 15 });
    });
  });


});