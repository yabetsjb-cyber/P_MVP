import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Layout } from '@/components/Layout';

describe('Customer Layout', () => {
  it('renders the bottom navigation with 4 items', () => {
    render(
      <Layout>
        <div data-testid="content">page content</div>
      </Layout>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /search/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /map/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /reservations/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  it('renders the page content passed as children', () => {
    render(
      <Layout>
        <div data-testid="content">hello world</div>
      </Layout>,
    );
    expect(screen.getByTestId('content')).toHaveTextContent('hello world');
  });
});