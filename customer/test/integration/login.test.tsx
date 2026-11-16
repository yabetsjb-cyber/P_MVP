import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/pages/login';
import { AuthProvider } from '@/context/AuthContext';
import { routerMocks } from '../setup';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
};

describe('Customer LoginPage', () => {
  it('renders the email and password inputs and submit button', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('submits valid credentials and redirects to /', async () => {
    renderPage();
    await userEvent.type(await screen.findByPlaceholderText(/email/i), 'buyer@example.com');
    await userEvent.type(screen.getByPlaceholderText(/password/i), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(routerMocks.push).toHaveBeenCalledWith('/');
    });
  });

  it('shows "Invalid email or password" on 401', async () => {
    renderPage();
    await userEvent.type(await screen.findByPlaceholderText(/email/i), 'buyer@example.com');
    await userEvent.type(screen.getByPlaceholderText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(routerMocks.push).not.toHaveBeenCalled();
  });
});