import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import TelegramPage from '@/pages/settings/telegram';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';

const API = 'http://localhost:3000';

const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <TelegramPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const fixtureLink = {
  chatId: '12345',
  label: 'Pharmacy iPad',
  linkedAt: '2026-11-10T10:00:00.000Z',
  linkedBy: 'Test Owner',
};

describe('TelegramPage', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('shows "not configured" when botConfigured is false', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/telegram`, () =>
        HttpResponse.json({ botConfigured: false, links: [] }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText(/telegram is not configured/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /connect telegram/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the empty state with Connect button when no links exist', async () => {
    renderPage();

    expect(
      await screen.findByText(/no telegram chats are connected yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect telegram/i }),
    ).toBeInTheDocument();
  });

  it('opens the connect dialog and generates a link when Connect is clicked', async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /connect telegram/i }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /connect a telegram chat/i }),
    ).toBeInTheDocument();

    expect(
      await within(dialog).findByRole('link', { name: /open telegram/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByDisplayValue(/t\.me\/MedFinderBot/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/link expires in/i),
    ).toBeInTheDocument();
  });

  it('shows expired message when the countdown reaches zero', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/telegram/link-token`, () =>
        HttpResponse.json({
          token: 'expired',
          url: 'https://t.me/MedFinderBot?start=expired',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    );

    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: /connect telegram/i }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/link has expired/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /open telegram/i })).not.toBeInTheDocument();
  });

  it('copies the deep link to the clipboard', async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: /connect telegram/i }),
    );

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('link', { name: /open telegram/i });

    await userEvent.click(
      within(dialog).getByRole('button', { name: /^copy link$/i }),
    );

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(/t\.me\/MedFinderBot\?start=/),
    );
    expect(
      await within(dialog).findByRole('button', { name: /copied/i }),
    ).toBeInTheDocument();
  });

  it('lists existing links with Disconnect and Test alert actions', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/telegram`, () =>
        HttpResponse.json({ botConfigured: true, links: [fixtureLink] }),
      ),
    );

    renderPage();

    expect(await screen.findByText('Pharmacy iPad')).toBeInTheDocument();
    expect(screen.getByText(/linked by test owner/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^disconnect$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send test alert/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect another chat/i }),
    ).toBeInTheDocument();
  });

  it('disconnect confirms and fires the DELETE request', async () => {
    let deleteCalled = false;
    server.use(
      http.get(`${API}/v1/pharmacy/telegram`, () =>
        HttpResponse.json({
          botConfigured: true,
          links: deleteCalled ? [] : [fixtureLink],
        }),
      ),
      http.delete(`${API}/v1/pharmacy/telegram/:chatId`, () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    renderPage();
    await screen.findByText('Pharmacy iPad');

    await userEvent.click(screen.getByRole('button', { name: /^disconnect$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /disconnect this chat/i }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /^disconnect$/i }),
    );

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText('Pharmacy iPad')).not.toBeInTheDocument();
    });
  });

  it('send test alert fires the POST and shows success', async () => {
    let testCalled = false;
    server.use(
      http.get(`${API}/v1/pharmacy/telegram`, () =>
        HttpResponse.json({ botConfigured: true, links: [fixtureLink] }),
      ),
      http.post(`${API}/v1/pharmacy/telegram/test`, () => {
        testCalled = true;
        return HttpResponse.json({ queuedTo: 1 });
      }),
    );

    renderPage();
    await screen.findByText('Pharmacy iPad');

    await userEvent.click(screen.getByRole('button', { name: /send test alert/i }));

    await waitFor(() => {
      expect(testCalled).toBe(true);
    });
    expect(
      await screen.findByText(/test alert queued to 1 chat/i),
    ).toBeInTheDocument();
  });

  it('shows existing links even when bot is not configured, and hides connect buttons', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/telegram`, () =>
        HttpResponse.json({
          botConfigured: false,
          links: [fixtureLink],
        }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText(/telegram is not configured/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Pharmacy iPad')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /connect telegram/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /connect another chat/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^disconnect$/i }),
    ).toBeInTheDocument();
  });

  it('disables send test alert when bot is not configured', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/telegram`, () =>
        HttpResponse.json({
          botConfigured: false,
          links: [fixtureLink],
        }),
      ),
    );

    renderPage();
    await screen.findByText('Pharmacy iPad');

    expect(
      screen.getByRole('button', { name: /send test alert/i }),
    ).toBeDisabled();
  });



});