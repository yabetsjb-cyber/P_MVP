import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import ReservationsPage from '@/pages/reservations';
import enMessages from '@/messages/en.json';
import { server } from '../mocks/server';
import { mockAuth } from '../mocks/handlers';
import { routerMocks } from '../setup';

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

describe('useAuthGuard', () => {
  it('redirects unauthenticated users to /login', async () => {
    server.use(...mockAuth('unauthenticated'));
    renderPage(ReservationsPage);
    await waitFor(() =>
      expect(routerMocks.replace).toHaveBeenCalledWith(
        expect.stringContaining('/login'),
      ),
    );
  });

  it('redirects pending pharmacies to /pending', async () => {
    server.use(...mockAuth('pending'));
    renderPage(ReservationsPage);
    await waitFor(() =>
      expect(routerMocks.replace).toHaveBeenCalledWith('/pending'),
    );
  });

  it('redirects suspended pharmacies to /suspended', async () => {
    server.use(...mockAuth('suspended'));
    renderPage(ReservationsPage);
    await waitFor(() =>
      expect(routerMocks.replace).toHaveBeenCalledWith('/suspended'),
    );
  });

  it('renders the page for a verified pharmacy', async () => {
    renderPage(ReservationsPage);
    expect(
      await screen.findByRole('heading', { name: /reservations/i }),
    ).toBeInTheDocument();
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });
});