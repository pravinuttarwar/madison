import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Reports from '@/pages/Reports';

afterEach(cleanup);
beforeEach(() => vi.unstubAllGlobals());

// MAD-43 — when no workbook is connected, Reports shows an inline CONNECT card (paste link),
// not a dead "pending" beat. Replaces the old MBI-37 pending state.
describe('Reports — inline connect when not connected (MAD-43)', () => {
  // Route the stub by pathname: report read fails (not connected), connection says not connected.
  function stubNotConnected(connectPost?: (input: string) => unknown) {
    vi.stubGlobal('fetch', (req: RequestInfo | URL, init?: RequestInit) => {
      const url = String(req);
      if (url.includes('/api/reports/connection') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        const r = connectPost
          ? connectPost(body.input)
          : { ok: true, status: 200, json: async () => ({ connected: true, name: 'Weekly.xlsx', source: 'share-url' }) };
        return Promise.resolve(r);
      }
      if (url.includes('/api/reports/connection')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: false }) });
      if (url.includes('/api/auth/scopes')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ requested: [], delegated: ['Files.Read'], app: [] }) });
      // /api/reports → not connected → 503
      return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
    });
  }

  it('[AC-1] shows a connect input + button (no nav tab), not the named-ranges pending copy', async () => {
    stubNotConnected();
    render(<Reports />);
    expect(await screen.findByPlaceholderText(/share.?link or drive path/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /connect/i })).toBeTruthy();
    expect(screen.queryByText(/named ranges/i)).toBeNull();
  });

  it('[AC-1] surfaces the Sites.Read.All hint when SharePoint scope is absent', async () => {
    stubNotConnected();
    render(<Reports />);
    await screen.findByPlaceholderText(/share.?link or drive path/i);
    await waitFor(() => expect(screen.getByText(/Sites\.Read\.All/)).toBeTruthy());
  });

  it('[AC-4] shows the specific failure reason and never echoes the pasted URL', async () => {
    stubNotConnected(() => ({
      ok: false, status: 422, statusText: 'Unprocessable Entity',
      json: async () => ({ error: 'not_reachable', reason: "We couldn't open that link. Check it and that you have access." }),
    }));
    render(<Reports />);
    const input = await screen.findByPlaceholderText(/share.?link or drive path/i);
    fireEvent.change(input, { target: { value: 'https://contoso.sharepoint.com/:x:/s/ops/secret.xlsx' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    await waitFor(() => expect(screen.getByText(/couldn't open that link/i)).toBeTruthy());
    expect(screen.queryByText(/contoso\.sharepoint\.com/)).toBeNull();
  });
});

// MAD-43 — connecting a valid workbook refetches and renders the report (AC-2). The shared
// connection's persistence across a backend restart is covered by the backend suite.
describe('Reports — connect then render (MAD-43)', () => {
  it('[AC-2] a successful connect refetches and renders the report', async () => {
    let connected = false;
    vi.stubGlobal('fetch', (req: RequestInfo | URL, init?: RequestInit) => {
      const url = String(req);
      if (url.includes('/api/reports/connection') && init?.method === 'POST') {
        connected = true;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: true, name: 'Weekly.xlsx', source: 'drive-path' }) });
      }
      if (url.includes('/api/reports/connection')) return Promise.resolve({ ok: true, status: 200, json: async () => (connected ? { connected: true, name: 'Weekly.xlsx', via: 'connection' } : { connected: false }) });
      if (url.includes('/api/auth/scopes')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ requested: [], delegated: ['Files.Read'], app: [] }) });
      return connected
        ? Promise.resolve({ ok: true, status: 200, json: async () => REPORT_WOW_ONLY })
        : Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
    });
    render(<Reports />);
    const input = await screen.findByPlaceholderText(/share.?link or drive path/i);
    fireEvent.change(input, { target: { value: '/Reports/Weekly.xlsx' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    await waitFor(() => expect(screen.getByText(/last week/i)).toBeTruthy());
  });
});

// MAD-43 — when connected, the report renders and a "Change workbook" affordance is offered.
describe('Reports — change workbook when connected (MAD-43)', () => {
  it('[AC-3] renders the report and a Change workbook control that reveals the input', async () => {
    vi.stubGlobal('fetch', (req: RequestInfo | URL) => {
      const url = String(req);
      if (url.includes('/api/reports/connection')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: true, name: 'Weekly.xlsx', source: 'share-url', via: 'connection' }) });
      if (url.includes('/api/auth/scopes')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ requested: [], delegated: ['Files.Read'], app: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => REPORT_WOW_ONLY });
    });
    render(<Reports />);
    expect(await screen.findByText(/last week/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /change workbook/i }));
    expect(await screen.findByPlaceholderText(/share.?link or drive path/i)).toBeTruthy();
  });
});

// MAD-29 — year-over-year comparison (thin additive on the named-range model).
const REPORT_WITH_YOY = {
  weekNumber: 16,
  metrics: [
    { key: 'newPatients', label: 'New patients', last: 22, prior: 18, yearAgo: 15 },
    { key: 'medicalSeen', label: 'Medical seen', last: 284, prior: 271, yearAgo: 250 },
  ],
  encountersBySpecialty: [
    { label: 'New patients', last: 22, prior: 18, yearAgo: 15 },
    { label: 'Medical seen', last: 284, prior: 271, yearAgo: 250 },
  ],
  totalEncounters: { last: 306, prior: 289, yearAgo: 265 },
};
const REPORT_WOW_ONLY = {
  weekNumber: 16,
  metrics: [{ key: 'newPatients', label: 'New patients', last: 22, prior: 18 }],
  encountersBySpecialty: [{ label: 'New patients', last: 22, prior: 18 }],
  totalEncounters: { last: 22, prior: 18 },
};

function stubReports(payload: unknown) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => payload }),
  );
}

// MAD-28 — month-over-month (month-to-date vs prior-month total).
const REPORT_WITH_MOM = {
  weekNumber: 16,
  metrics: [
    { key: 'newPatients', label: 'New patients', last: 22, prior: 18, monthToDate: 80, prevMonth: 95 },
    { key: 'medicalSeen', label: 'Medical seen', last: 284, prior: 271, monthToDate: 1100, prevMonth: 1180 },
  ],
  encountersBySpecialty: [
    { label: 'New patients', last: 22, prior: 18, monthToDate: 80, prevMonth: 95 },
    { label: 'Medical seen', last: 284, prior: 271, monthToDate: 1100, prevMonth: 1180 },
  ],
  totalEncounters: { last: 306, prior: 289, monthToDate: 1180, prevMonth: 1275 },
};

// MAD-46 — the additive "By provider" panel renders when the report carries providers.
describe('Reports — by-provider breakdown (MAD-46)', () => {
  it('[AC-4] renders a By provider panel with the provider rows', async () => {
    stubReports({
      ...REPORT_WOW_ONLY,
      providers: [
        { name: 'Gunn', current: 88, prior: 70 },
        { name: 'DeRosa', current: 86, prior: 60 },
      ],
    });
    render(<Reports />);
    expect(await screen.findByText('By provider')).toBeTruthy();
    expect(screen.getByText('Gunn')).toBeTruthy();
    expect(screen.getByText('DeRosa')).toBeTruthy();
  });

  it('[AC-4] omits the By provider panel when there are no providers (additive)', async () => {
    stubReports(REPORT_WOW_ONLY);
    render(<Reports />);
    await screen.findByText(/last week/i);
    expect(screen.queryByText('By provider')).toBeNull();
  });
});

describe('Reports — month-over-month comparison (MAD-28)', () => {
  it('[AC-2] shows a month-over-month column/indicator when month values are present', async () => {
    stubReports(REPORT_WITH_MOM);
    render(<Reports />);
    expect((await screen.findAllByText(/month.?over.?month|mom|vs last month/i)).length).toBeGreaterThanOrEqual(1);
    // WoW column still present.
    expect(screen.getByText('Last week')).toBeTruthy();
  });

  it('[AC-4] encounters-by-specialty reflects the month-over-month comparison', async () => {
    stubReports(REPORT_WITH_MOM);
    render(<Reports />);
    expect(await screen.findByText('Encounters by specialty')).toBeTruthy();
    expect(screen.getAllByText(/month.?over.?month|mom|vs last month/i).length).toBeGreaterThanOrEqual(1);
  });

  it('[AC-3] renders week-over-week with no MoM column when month values are absent', async () => {
    stubReports(REPORT_WOW_ONLY);
    render(<Reports />);
    expect(await screen.findByText(/last week/i)).toBeTruthy();
    expect(screen.queryByText(/month.?over.?month|mom|vs last month/i)).toBeNull();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
  });
});

describe('Reports — year-over-year comparison (MAD-29)', () => {
  it('[AC-2] shows a year-over-year column/indicator when year-ago values are present', async () => {
    stubReports(REPORT_WITH_YOY);
    render(<Reports />);
    // A YoY treatment appears, distinct from the week-over-week "Prior" column.
    expect((await screen.findAllByText(/year.?over.?year|yoy|vs last year/i)).length).toBeGreaterThanOrEqual(1);
    // The week-over-week column is still there (unique table header).
    expect(screen.getByText('Last week')).toBeTruthy();
  });

  it('[AC-4] encounters-by-specialty reflects the year-ago comparison', async () => {
    stubReports(REPORT_WITH_YOY);
    render(<Reports />);
    const panel = await screen.findByText('Encounters by specialty');
    // The section renders without error and shows the YoY treatment somewhere in the page.
    expect(panel).toBeTruthy();
    expect(screen.getAllByText(/year.?over.?year|yoy|vs last year/i).length).toBeGreaterThanOrEqual(1);
  });

  it('[AC-3] renders week-over-week exactly as before when no year-ago values (no YoY column, no error)', async () => {
    stubReports(REPORT_WOW_ONLY);
    render(<Reports />);
    // WoW view intact…
    expect(await screen.findByText(/last week/i)).toBeTruthy();
    // …and no YoY treatment is shown.
    expect(screen.queryByText(/year.?over.?year|yoy|vs last year/i)).toBeNull();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
  });
});
