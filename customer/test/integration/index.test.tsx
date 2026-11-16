import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from '@/pages/index';
import { AuthProvider } from '@/context/AuthContext';

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

describe('Customer HomePage', () => {
  it('renders the search heading and input', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /find your medicine/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search medicine/i)).toBeInTheDocument();
  });
});