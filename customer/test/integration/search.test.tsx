import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from '@/pages/index';
import { AuthProvider } from '@/context/AuthContext';

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

describe('Customer HomePage — map-first search', () => {
  it('renders the search input and the idle empty state', async () => {
    renderPage();
    expect(
      await screen.findByPlaceholderText(/search medicine/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/search for a medicine/i)).toBeInTheDocument();
  });

  it('shows pharmacies in the bottom sheet after a search', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText(/search medicine/i),
      'amoxil',
    );

    expect(await screen.findByText('Abeba Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('Marta Pharmacy')).toBeInTheDocument();
    expect(screen.getByText(/2 pharmacies nearby/i)).toBeInTheDocument();
    expect(screen.getByText(/low stock/i)).toBeInTheDocument();
  });

  it('renders pins on the map after results arrive', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText(/search medicine/i),
      'amoxil',
    );

    // Wait for the results to arrive. The map re-renders its pharmacy count
    // from the same state, so once "Abeba Pharmacy" is in the sheet, the map
    // has been updated too.
    await screen.findByText('Abeba Pharmacy');

    const map = screen.getByTestId('map-view');
    expect(map).toHaveTextContent('2 pins');
  });

  it('shows "no nearby stock" for a non-matching query', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText(/search medicine/i),
      'zzzznomatch',
    );

    expect(await screen.findByText(/no nearby stock/i)).toBeInTheDocument();
  });

  it('shows the restricted-medicine notice', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText(/search medicine/i),
      'restricted',
    );

    expect(
      await screen.findByText(/this medicine is not listed online/i),
    ).toBeInTheDocument();
  });

  it('shows the unavailable hint when the medicine matched but nobody has it', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText(/search medicine/i),
      'unavailable',
    );

    expect(await screen.findByText(/no nearby stock/i)).toBeInTheDocument();
    expect(screen.getByText(/1 similar medicine/i)).toBeInTheDocument();
  });

  it('clears the search when the X button is clicked', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText(/search medicine/i),
      'amoxil',
    );
    await screen.findByText('Abeba Pharmacy');

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));

    // The debounce fires 400ms after the input is cleared. Wait for the
    // idle sheet to re-render. findByText auto-waits up to 1000ms.
    expect(
      await screen.findByText(/search for a medicine/i),
    ).toBeInTheDocument();
  });
});