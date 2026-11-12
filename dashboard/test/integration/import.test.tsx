import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import ImportPage from '@/pages/import';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';


const renderPage = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider initialLocale="en" initialMessages={enMessages}>
        <AuthProvider>
          <ImportPage />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const makeCsv = (name = 'inventory.csv') =>
  new File(['brand_name,generic_name,quantity\nAmoxil,Amoxicillin,10\n'], name, {
    type: 'text/csv',
  });

describe('ImportPage', () => {
  it('renders step 1 with disabled upload button', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: /import inventory/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/csv file/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /update —/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /sync —/i })).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: /upload and preview/i }),
    ).toBeDisabled();
  });

  it('enables upload when a valid CSV file is chosen', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /upload and preview/i }),
      ).toBeEnabled();
    });
  });

  it('rejects a non-CSV file with inline error', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    const xlsx = new File(['fake'], 'inventory.xlsx', {
      type: 'application/vnd.ms-excel',
    });
    await userEvent.upload(input, xlsx);

    expect(await screen.findByText(/only .csv files are allowed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upload and preview/i }),
    ).toBeDisabled();
  });

  it('uploads a valid file and shows the preview summary in step 2', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());

    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );

    expect(
      await screen.findByRole('heading', { name: /preview summary/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/10 rows in file/i)).toBeInTheDocument();
    expect(screen.getByText(/7 ready to import/i)).toBeInTheDocument();
    expect(screen.getByText(/2 with errors/i)).toBeInTheDocument();
    expect(screen.getByText(/1 not in catalog/i)).toBeInTheDocument();
    expect(screen.getByText(/6 products will be updated/i)).toBeInTheDocument();
    expect(screen.getByText(/1 duplicate rows merged/i)).toBeInTheDocument();
    expect(screen.getByText(/file: inventory\.csv/i)).toBeInTheDocument();
  });

  it('sync mode with problems shows the sync-blocked banner', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(screen.getByRole('radio', { name: /sync —/i }));

    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );

    await screen.findByRole('heading', { name: /preview summary/i });
    expect(
      await screen.findByText(/sync mode requires every row to be valid/i),
    ).toBeInTheDocument();
  });
});