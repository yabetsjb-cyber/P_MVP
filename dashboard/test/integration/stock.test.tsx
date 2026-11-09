import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import StockPage from '@/pages/stock';
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
});