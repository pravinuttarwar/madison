import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Connections from '@/pages/Connections';

afterEach(cleanup);

function renderConnections() {
  return render(
    <MemoryRouter>
      <Connections />
    </MemoryRouter>,
  );
}

// MBI-38: with the sample path gone, the Connections badges have only sandbox/live
// states. Under the default env the apps are sandbox → badges read "Sandbox", and no
// chrome implies "sample data".
describe('Connections — sandbox badges, no sample-data copy (MBI-38)', () => {
  it('renders Sandbox badges for the source panels', async () => {
    renderConnections();
    // Microsoft 365 + QuickBooks panels each carry a Sandbox badge.
    expect((await screen.findAllByText('Sandbox')).length).toBeGreaterThanOrEqual(2);
  });

  it('contains no "sample data" copy anywhere', async () => {
    renderConnections();
    await screen.findAllByText('Sandbox');
    expect(screen.queryByText(/sample data/i)).toBeNull();
  });
});

// MAD-26 — the weekly-report workbook connection card (paste → validate → status).
describe('Connections — weekly workbook connection (MAD-26)', () => {
  it('[AC-1][AC-4] shows the connected workbook name and a paste field to (re)connect', async () => {
    renderConnections();
    // The default stub reports a connected workbook → its name is shown.
    expect(await screen.findByText(/Madison Weekly Report\.xlsx/)).toBeTruthy();
    // And a field to paste a share-URL or drive path.
    expect(screen.getByPlaceholderText(/share.?link or drive path/i)).toBeTruthy();
  });

  it('[AC-3] surfaces a plain-language reason when the workbook is not reachable', async () => {
    renderConnections();
    const input = await screen.findByPlaceholderText(/share.?link or drive path/i);

    // Override fetch so the POST connect returns a 422 not-reachable with a reason.
    vi.stubGlobal('fetch', (_req: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: async () => ({ error: 'not_reachable', reason: "We couldn't open that link. Check the share-URL or drive path." }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => ({ connected: false }) });
    });

    fireEvent.change(input, { target: { value: 'https://contoso.sharepoint.com/:x:/s/ops/bad.xlsx' } });
    fireEvent.click(screen.getByRole('button', { name: /connect workbook/i }));

    await waitFor(() => expect(screen.getByText(/couldn't open that link/i)).toBeTruthy());
    // The not-reachable message must not echo the raw share-URL.
    expect(screen.queryByText(/contoso\.sharepoint\.com/)).toBeNull();
  });
});

// MAD-42 — granted-scopes readout + SharePoint access hint on the Connections page.
describe('Connections — granted Microsoft scopes + SharePoint hint (MAD-42)', () => {
  function stubScopes(delegated: string[]) {
    vi.stubGlobal('fetch', (req: RequestInfo | URL) => {
      const url = String(req);
      const json =
        url.includes('/api/auth/scopes')
          ? { requested: ['Mail.Read', 'Files.Read'], delegated, app: [] }
          : url.includes('/api/sources/status')
            ? [
                { id: 'outlook', label: 'Outlook', mode: 'sandbox' },
                { id: 'microsoftToDo', label: 'Microsoft To Do', mode: 'sandbox' },
                { id: 'quickbooks', label: 'QuickBooks', mode: 'sandbox' },
                { id: 'spreadsheet', label: 'Weekly spreadsheet', mode: 'sandbox' },
              ]
            : { connected: false };
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => json });
    });
  }

  it('[AC-3] shows the granted scopes readout and a Sites.Read.All hint when it is absent', async () => {
    stubScopes(['Mail.Read', 'Calendars.Read', 'Tasks.Read', 'Files.Read']);
    renderConnections();
    // the granted-access readout renders (distinct from the static requested-scope list)
    expect(await screen.findByText(/granted to this sign-in/i)).toBeTruthy();
    // and a muted note that SharePoint files need Sites.Read.All (absent here)
    await waitFor(() => expect(screen.getByText(/need .*Sites\.Read\.All/i)).toBeTruthy());
  });

  it('[AC-3] shows NO Sites.Read.All hint when the scope is already granted', async () => {
    stubScopes(['Mail.Read', 'Files.Read', 'Sites.Read.All']);
    renderConnections();
    await screen.findByText(/granted to this sign-in/i);
    // the warning copy ("need ... Sites.Read.All") must not be present
    await waitFor(() => expect(screen.queryByText(/need .*Sites\.Read\.All/i)).toBeNull());
  });
});
