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

    it('shows Decline button on both New and Active cards', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^active$/i }));
    await screen.findByText('Panadol');
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeInTheDocument();
  });

  it('opens decline dialog with default out_of_stock reason and checkbox checked', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /decline reservation/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox')).toHaveValue('out_of_stock');
    expect(within(dialog).getByRole('checkbox')).toBeChecked();
    expect(
      within(dialog).getByText(/also mark out of stock/i),
    ).toBeInTheDocument();
  });

  it('cancels decline dialog without sending a request', async () => {
    let posted = false;
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/:id/decline`, () => {
        posted = true;
        return HttpResponse.json({ reservation: {}, markedOutOfStock: true });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^cancel$/i }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('sends POST decline with default { reason: out_of_stock }', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${API}/v1/pharmacy/reservations/:id/decline`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({
            reservation: { ...reservationFixtures.pending, status: 'declined' },
            markedOutOfStock: true,
          });
        },
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^decline reservation$/i }),
    );

    await waitFor(() => {
      expect(captured).toEqual({ reason: 'out_of_stock' });
    });
  });

  it('sends alsoMarkOutOfStock:false when checkbox is unchecked', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${API}/v1/pharmacy/reservations/:id/decline`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({
            reservation: { ...reservationFixtures.pending, status: 'declined' },
            markedOutOfStock: false,
          });
        },
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^decline reservation$/i }),
    );

    await waitFor(() => {
      expect(captured).toEqual({
        reason: 'out_of_stock',
        alsoMarkOutOfStock: false,
      });
    });
  });

  it('sends { reason: other, note } when other is chosen', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${API}/v1/pharmacy/reservations/:id/decline`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({
            reservation: { ...reservationFixtures.pending, status: 'declined' },
            markedOutOfStock: false,
          });
        },
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'other');
    await userEvent.type(
      within(dialog).getByRole('textbox'),
      'Customer asked to cancel',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^decline reservation$/i }),
    );

    await waitFor(() => {
      expect(captured).toEqual({
        reason: 'other',
        note: 'Customer asked to cancel',
      });
    });
  });

  it('blocks submit with inline error when other is chosen but note is empty', async () => {
    let posted = false;
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/:id/decline`, () => {
        posted = true;
        return HttpResponse.json({ reservation: {}, markedOutOfStock: false });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'other');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^decline reservation$/i }),
    );

    expect(
      await screen.findByText(/a note is required for the other reason/i),
    ).toBeInTheDocument();
    expect(posted).toBe(false);
  });
  it('shows the Look up by code button and opens the dialog with an empty input', async () => {
    renderPage();
    await screen.findByText('Amoxil');

    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /look up reservation/i }),
    ).toBeInTheDocument();
    const input = within(dialog).getByRole('textbox');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('maxlength', '6');
  });

  it('auto-normalizes the code input (uppercase, O→0, I/L→1, strip non-alnum)', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox');

    await userEvent.type(input, 'k7m2o');
    expect(input).toHaveValue('K7M20');

    await userEvent.type(input, 'q');
    expect(input).toHaveValue('K7M20Q');
  });

  it('disables Look up until the code is 6 characters', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /^look up$/i });
    expect(submit).toBeDisabled();

    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2Q');
    expect(submit).toBeDisabled();

    await userEvent.type(within(dialog).getByRole('textbox'), 'D');
    expect(submit).toBeEnabled();
  });

  it('lookup success on a confirmed reservation shows the card with ready-for-pickup badge', async () => {
    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2QD');
    await userEvent.click(within(dialog).getByRole('button', { name: /^look up$/i }));

    expect(await within(dialog).findByText('Panadol')).toBeInTheDocument();
    expect(within(dialog).getByText(/ready for pickup/i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /^hand over$/i }),
    ).toBeEnabled();
  });

  it('lookup success on a requested reservation shows not-confirmed note', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/lookup`, () =>
        HttpResponse.json({
          reservation: reservationFixtures.pending,
          readyForPickup: false,
        }),
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2QD');
    await userEvent.click(within(dialog).getByRole('button', { name: /^look up$/i }));

    expect(await within(dialog).findByText('Amoxil')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/not yet confirmed/i),
    ).toBeInTheDocument();
  });

  it('lookup 404 shows inline error', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/lookup`, () =>
        HttpResponse.json({ error: 'CODE_NOT_FOUND' }, { status: 404 }),
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2QD');
    await userEvent.click(within(dialog).getByRole('button', { name: /^look up$/i }));

    expect(
      await within(dialog).findByText(/no active reservation with that code/i),
    ).toBeInTheDocument();
  });

  it('hand over on a confirmed reservation calls fulfil and closes the dialog', async () => {
    let fulfilCalled = false;
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/:id/fulfil`, () => {
        fulfilCalled = true;
        return HttpResponse.json({
          reservation: { ...reservationFixtures.confirmed, status: 'fulfilled' },
        });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2QD');
    await userEvent.click(within(dialog).getByRole('button', { name: /^look up$/i }));
    await within(dialog).findByText('Panadol');
    await userEvent.click(within(dialog).getByRole('button', { name: /^hand over$/i }));

    await waitFor(() => {
      expect(fulfilCalled).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('hand over on a requested reservation confirms first, then fulfils', async () => {
    let confirmCalled = false;
    let fulfilCalled = false;
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/lookup`, () =>
        HttpResponse.json({
          reservation: reservationFixtures.pending,
          readyForPickup: false,
        }),
      ),
      http.post(`${API}/v1/pharmacy/reservations/:id/confirm`, async ({ request }) => {
        const body = (await request.json()) as { holdMinutes?: number };
        confirmCalled = true;
        expect(body.holdMinutes).toBe(120);
        return HttpResponse.json({
          reservation: { ...reservationFixtures.pending, status: 'confirmed' },
        });
      }),
      http.post(`${API}/v1/pharmacy/reservations/:id/fulfil`, () => {
        fulfilCalled = true;
        return HttpResponse.json({
          reservation: { ...reservationFixtures.pending, status: 'fulfilled' },
        });
      }),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2QD');
    await userEvent.click(within(dialog).getByRole('button', { name: /^look up$/i }));
    await within(dialog).findByText(/not yet confirmed/i);
    await userEvent.click(within(dialog).getByRole('button', { name: /^hand over$/i }));

    await waitFor(() => {
      expect(confirmCalled).toBe(true);
      expect(fulfilCalled).toBe(true);
    });
  });

  it('fulfil 403 WRONG_CODE shows inline error and keeps the dialog open', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/reservations/:id/fulfil`, () =>
        HttpResponse.json({ error: 'WRONG_CODE' }, { status: 403 }),
      ),
    );

    renderPage();
    await screen.findByText('Amoxil');
    await userEvent.click(
      screen.getByRole('button', { name: /look up by code/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'K7M2QD');
    await userEvent.click(within(dialog).getByRole('button', { name: /^look up$/i }));
    await within(dialog).findByText('Panadol');
    await userEvent.click(within(dialog).getByRole('button', { name: /^hand over$/i }));

    expect(
      await within(dialog).findByText(/the code does not match this reservation/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });





});