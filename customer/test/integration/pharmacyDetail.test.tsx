import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const openAbebaDetail = async () => {
  await userEvent.type(
    await screen.findByPlaceholderText(/search medicine/i),
    'amoxil',
  );
  const card = await screen.findByRole('button', { name: /abeba pharmacy/i });
  await userEvent.click(card);
  await screen.findByRole('heading', { name: /abeba pharmacy/i });
};

describe('PharmacyDetail', () => {
  it('transitions to detail view when a pharmacy card is tapped', async () => {
    renderPage();
    await openAbebaDetail();
    expect(
      screen.getByRole('heading', { name: /abeba pharmacy/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2 pharmacies nearby/i)).not.toBeInTheDocument();
  });

  it('shows address, distance, and full medicine details', async () => {
    renderPage();
    await openAbebaDetail();
    expect(screen.getByText(/bole road/i)).toBeInTheDocument();
    expect(screen.getByText(/320 m/i)).toBeInTheDocument();
    expect(screen.getByText(/amoxil/i)).toBeInTheDocument();
    expect(screen.getByText(/500mg/i)).toBeInTheDocument();
    expect(screen.getByText(/16 caps/i)).toBeInTheDocument();
    expect(screen.getByText(/10 available to reserve/i)).toBeInTheDocument();
  });

  it('back arrow returns to the results list', async () => {
    renderPage();
    await openAbebaDetail();
    await userEvent.click(
      screen.getByRole('button', { name: /back to results/i }),
    );
    expect(await screen.findByText(/2 pharmacies nearby/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /abeba pharmacy/i }),
    ).not.toBeInTheDocument();
  });

  

  it('shows the Rx badge for prescription-only medicines', async () => {
    renderPage();
    await openAbebaDetail();
    // The Amoxil fixture has requiresPrescription: true
    expect(screen.getByText(/^rx$/i)).toBeInTheDocument();
  });

  it('shows the phone Call link when the pharmacy has a phone number', async () => {
    renderPage();
    await openAbebaDetail();
    const callLink = screen.getByRole('link', { name: /call/i });
    expect(callLink).toHaveAttribute('href', 'tel:+251911234567');
  });
});