import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import ImportPage from '@/pages/import';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { makeQueryClient } from '@/lib/queryClient';
import enMessages from '@/messages/en.json';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { routerMocks } from '../setup';

const API = 'http://localhost:3000';
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

    it('renders the rows table with all rows after upload', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    // Wait for rows to load
    expect(await screen.findByText('Amoxil')).toBeInTheDocument();
    expect(screen.getByText('Panadol')).toBeInTheDocument();
    expect(screen.getByText('BadRow')).toBeInTheDocument();
    expect(screen.getByText('UnknownDrug')).toBeInTheDocument();
  });

  it('filter tabs trigger a refetch with the correct status param', async () => {
    let lastUrl = '';
    server.use(
      http.get(`${API}/v1/pharmacy/imports/:id/rows`, ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json({ rows: [] });
      }),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    await userEvent.click(screen.getByRole('tab', { name: /^errors$/i }));

    await waitFor(() => {
      expect(lastUrl).toContain('status=error');
      expect(lastUrl).toContain('offset=0');
    });
  });

  it('pagination next button advances the offset', async () => {
    // Simulate a filter with 100 total rows so hasNext is true
    server.use(
      http.post(`${API}/v1/pharmacy/imports`, () => {
        return HttpResponse.json(
          {
            import: {
              id: 'imp-1',
              filename: 'inventory.csv',
              mode: 'update',
              totalRows: 100,
              okRows: 100,
              errorRows: 0,
              unmatchedRows: 0,
              productsToUpdate: 100,
              mergedRows: 0,
              willMarkOutOfStock: null,
              ignoredColumns: [],
              expiresInHours: 24,
            },
            canCommit: true,
            requiresAcceptSkipped: false,
            syncBlockedReason: null,
            problems: [],
            problemsShown: 0,
            sample: [],
          },
          { status: 201 },
        );
      }),
      http.get(`${API}/v1/pharmacy/imports/:id/rows`, ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const rows = Array.from({ length: 50 }, (_, i) => ({
          row_number: offset + i + 1,
          status: 'ok' as const,
          raw: { brand_name: `Item ${offset + i + 1}` },
          errors: [],
          warnings: [],
          medicine_id: `med-${offset + i}`,
          quantity: 10,
          expiry_date: '2027-12-31',
          suggestions: null,
        }));
        return HttpResponse.json({ rows });
      }),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });
    await screen.findByText('Item 1');

    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));

    expect(await screen.findByText('Item 51')).toBeInTheDocument();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });

  it('shows empty state when filter returns no rows', async () => {
    server.use(
      http.get(`${API}/v1/pharmacy/imports/:id/rows`, () =>
        HttpResponse.json({ rows: [] }),
      ),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    expect(
      await screen.findByText(/no rows match this filter/i),
    ).toBeInTheDocument();
  });

  it('shows Download errors button only when there are error rows', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    // Default mock has 2 error rows
    expect(
      await screen.findByRole('button', { name: /download errors/i }),
    ).toBeInTheDocument();
  });

  it('unmatched rows display the brand name from raw, not the medicine id', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    // The unmatched row in the mock has raw.brand_name = "UnknownDrug"
    expect(await screen.findByText('UnknownDrug')).toBeInTheDocument();
    expect(screen.getByText(/^not in catalog/i)).toBeInTheDocument();
  });


    it('Continue to commit transitions to step 3', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(
      await screen.findByRole('heading', { name: /commit import/i }),
    ).toBeInTheDocument();
  });

  it('requires the acceptSkipped checkbox before committing when rows will be skipped', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });

    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /commit import/i });

    // Commit button is disabled until checkbox is checked
    const commitBtn = screen.getByRole('button', { name: /^commit import$/i });
    expect(commitBtn).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(commitBtn).toBeEnabled();
  });

  it('sends acceptSkipped:true and shows success counts after commit', async () => {
    let captured: unknown = null;
    server.use(
      http.post(`${API}/v1/pharmacy/imports/:id/commit`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          committed: true,
          summary: { created: 3, updated: 5, markedOutOfStock: 0, skippedRows: 2 },
        });
      }),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /commit import/i });

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /^commit import$/i }));

    await waitFor(() => {
      expect(captured).toEqual({ acceptSkipped: true });
    });
    expect(await screen.findByText(/import complete/i)).toBeInTheDocument();
    expect(screen.getByText(/3 new products added/i)).toBeInTheDocument();
    expect(screen.getByText(/5 products updated/i)).toBeInTheDocument();
    expect(screen.getByText(/2 rows skipped/i)).toBeInTheDocument();
  });

  it('sync mode shows the mark-out warning, requires checkbox, and sends confirmOutOfStockCount', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/imports`, () =>
        HttpResponse.json(
          {
            import: {
              id: 'imp-sync-1',
              filename: 'inventory.csv',
              mode: 'sync',
              totalRows: 5,
              okRows: 5,
              errorRows: 0,
              unmatchedRows: 0,
              productsToUpdate: 5,
              mergedRows: 0,
              willMarkOutOfStock: 3,
              ignoredColumns: [],
              expiresInHours: 24,
            },
            canCommit: true,
            requiresAcceptSkipped: false,
            syncBlockedReason: null,
            problems: [],
            problemsShown: 0,
            sample: [],
          },
          { status: 201 },
        ),
      ),
    );

    let captured: unknown = null;
    server.use(
      http.post(`${API}/v1/pharmacy/imports/:id/commit`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          committed: true,
          summary: { created: 0, updated: 2, markedOutOfStock: 3, skippedRows: 0 },
        });
      }),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(screen.getByRole('radio', { name: /sync —/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /commit import/i });

    // Mark-out warning appears
    expect(
      await screen.findByText(/i understand 3 products will be marked out of stock/i),
    ).toBeInTheDocument();
    const commitBtn = screen.getByRole('button', { name: /^commit import$/i });
    expect(commitBtn).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(commitBtn).toBeEnabled();
    await userEvent.click(commitBtn);

    await waitFor(() => {
      expect(captured).toEqual({ confirmOutOfStockCount: 3 });
    });
  });

  it('shows inline error when server returns CONFIRM_OUT_OF_STOCK_COUNT', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/imports`, () =>
        HttpResponse.json(
          {
            import: {
              id: 'imp-sync-1',
              filename: 'inventory.csv',
              mode: 'sync',
              totalRows: 5,
              okRows: 5,
              errorRows: 0,
              unmatchedRows: 0,
              productsToUpdate: 5,
              mergedRows: 0,
              willMarkOutOfStock: 3,
              ignoredColumns: [],
              expiresInHours: 24,
            },
            canCommit: true,
            requiresAcceptSkipped: false,
            syncBlockedReason: null,
            problems: [],
            problemsShown: 0,
            sample: [],
          },
          { status: 201 },
        ),
      ),
      http.post(`${API}/v1/pharmacy/imports/:id/commit`, () =>
        HttpResponse.json(
          { error: 'CONFIRM_OUT_OF_STOCK_COUNT', willMarkOutOfStock: 7 },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(screen.getByRole('radio', { name: /sync —/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /commit import/i });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /^commit import$/i }));

    expect(
      await screen.findByText(/out-of-stock count changed/i),
    ).toBeInTheDocument();
    // Still on step 3
    expect(screen.getByRole('heading', { name: /commit import/i })).toBeInTheDocument();
  });

  it('shows inline error when server returns ALREADY_COMMITTED', async () => {
    server.use(
      http.post(`${API}/v1/pharmacy/imports/:id/commit`, () =>
        HttpResponse.json({ error: 'ALREADY_COMMITTED' }, { status: 409 }),
      ),
    );

    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /commit import/i });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /^commit import$/i }));

    expect(
      await screen.findByText(/already been committed/i),
    ).toBeInTheDocument();
  });

  it('Back to stock button on success navigates to /stock', async () => {
    renderPage();
    const input = await screen.findByLabelText(/csv file/i);
    await userEvent.upload(input, makeCsv());
    await userEvent.click(
      screen.getByRole('button', { name: /upload and preview/i }),
    );
    await screen.findByRole('heading', { name: /preview summary/i });
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /commit import/i });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /^commit import$/i }));

    await screen.findByText(/import complete/i);
    await userEvent.click(screen.getByRole('button', { name: /back to stock/i }));

    await waitFor(() => {
      expect(routerMocks.push).toHaveBeenCalledWith('/stock');
    });
  });

});