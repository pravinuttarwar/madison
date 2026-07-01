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
    await waitFor(() => expect(screen.getByText(/Encounters by specialty/i)).toBeTruthy());
  });
});

// MAD-52 — connect a workbook by YEAR, with an overwrite warning when that year is already connected.
describe('Reports — connect by year + overwrite warning (MAD-52)', () => {
  it('[AC-1][AC-2] warns before overwriting an already-connected year, then replaces (sends the year) on confirm', async () => {
    const YEAR = new Date().getFullYear(); // the select defaults to this year
    const posts: { input: string; year?: number }[] = [];
    vi.stubGlobal('fetch', (req: RequestInfo | URL, init?: RequestInit) => {
      const url = String(req);
      if (url.includes('/api/reports/connection') && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body || '{}')));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: true, name: 'x', source: 'drive-path', year: YEAR }) });
      }
      if (url.includes('/api/reports/connection')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: true, name: `${YEAR}.xlsx`, via: 'connection', years: [{ year: YEAR, name: `${YEAR}.xlsx` }] }) });
      if (url.includes('/api/auth/scopes')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ requested: [], delegated: ['Files.Read'], app: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => REPORT_WOW_ONLY });
    });
    render(<Reports />);
    expect(await screen.findByText(/Encounters by specialty/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /change workbook/i }));
    const input = await screen.findByPlaceholderText(/share.?link or drive path/i);
    expect(screen.getByLabelText(/year this workbook covers/i)).toBeTruthy();
    fireEvent.change(input, { target: { value: '/Reports/new.xlsx' } });

    // First click on the already-connected year → overwrite warning, NO post yet.
    fireEvent.click(screen.getByRole('button', { name: /connect new workbook/i }));
    await waitFor(() => expect(screen.getByText(/already connected/i)).toBeTruthy());
    expect(posts.length).toBe(0);

    // Confirm → posts the connection WITH the year.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`replace ${YEAR} workbook`, 'i') }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].year).toBe(YEAR);
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
    expect(await screen.findByText(/Encounters by specialty/i)).toBeTruthy();
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

// MAD-48 — the Refresh button forces a server re-read via /api/reports?refresh=1.
describe('Reports — refresh button (MAD-48)', () => {
  it('[AC-6] clicking Refresh re-fetches the report with refresh=1', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (req: RequestInfo | URL) => {
      const url = String(req);
      urls.push(url);
      if (url.includes('/api/reports/connection')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: true, name: 'Weekly.xlsx', via: 'connection' }) });
      if (url.includes('/api/auth/scopes')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ requested: [], delegated: [], app: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => REPORT_WOW_ONLY });
    });
    render(<Reports />);
    await screen.findByText(/Encounters by specialty/i);
    expect(urls.some((u) => u.includes('/api/reports?refresh=1'))).toBe(false); // not on first load
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(urls.some((u) => u.includes('/api/reports?refresh=1'))).toBe(true));
  });
});

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
    await screen.findByText(/Encounters by specialty/i);
    expect(screen.queryByText('By provider')).toBeNull();
  });
});

// MAD-50 — real period label (no "Week 0") + "found but not counted" warnings note.
describe('Reports — period label + not-counted warnings (MAD-50)', () => {
  it('[AC-4] renders the real period (e.g. "June 2026 vs May 2026"), never "Week 0"', async () => {
    stubReports({ ...REPORT_WOW_ONLY, period: { current: 'June 2026', prior: 'May 2026' } });
    render(<Reports />);
    expect(await screen.findByText(/June 2026 vs May 2026/)).toBeTruthy();
    expect(screen.queryByText(/Week 0/)).toBeNull();
  });

  it('[AC-2] shows a "found but not counted" note listing the skipped labels', async () => {
    stubReports({ ...REPORT_WOW_ONLY, period: { current: 'June 2026', prior: 'May 2026' }, warnings: [{ label: 'allergy' }, { label: 'Sprained Wombat' }] });
    render(<Reports />);
    expect(await screen.findByText(/found but not counted/i)).toBeTruthy();
    expect(screen.getByText(/allergy/)).toBeTruthy();
    expect(screen.getByText(/Sprained Wombat/)).toBeTruthy();
  });

  it('[AC-2] omits the note when there are no warnings (additive)', async () => {
    stubReports({ ...REPORT_WOW_ONLY, period: { current: 'June 2026', prior: 'May 2026' } });
    render(<Reports />);
    await screen.findByText(/June 2026/);
    expect(screen.queryByText(/found but not counted/i)).toBeNull();
  });
});

// MAD-51 — Month | Week period toggle. The report carries an additive `weekly` block view; a
// toggle (default Month) swaps the numbers AND the labels to the selected period.
const REPORT_WITH_WEEKLY = {
  ...REPORT_WOW_ONLY,
  metrics: [{ key: 'newPatients', label: 'New patients', last: 22, prior: 18 }],
  encountersBySpecialty: [{ label: 'New patients', last: 22, prior: 18 }],
  totalEncounters: { last: 22, prior: 18 },
  period: { current: 'June 2026', prior: 'May 2026' },
  weekly: {
    period: { current: 'Week of Jun 22', prior: 'Week of Jun 15' },
    metrics: [{ key: 'newPatients', label: 'New patients', last: 9, prior: 7 }],
    encountersBySpecialty: [{ label: 'New patients', last: 9, prior: 7 }],
    totalEncounters: { last: 9, prior: 7 },
  },
};

// MAD-53 — same-month YoY correctness: absent prior-year metrics render "—" (no fake delta) and a
// partial prior-year sheet surfaces a note.
describe('Reports — YoY correctness (MAD-53)', () => {
  it('[AC-6] shows a partial-YoY note and renders "—" for a metric missing from the prior year', async () => {
    stubReports({
      weekNumber: 0,
      period: { current: 'June 2026', prior: 'May 2026' },
      metrics: [
        { key: 'med', label: 'Medical', last: 120, prior: 110, yearAgo: 100 },
        { key: 'chiro', label: 'Chiro', last: 64, prior: 60 }, // absent in prior year → no yearAgo
      ],
      encountersBySpecialty: [
        { label: 'Medical', last: 120, prior: 110, yearAgo: 100 },
        { label: 'Chiro', last: 64, prior: 60 },
      ],
      totalEncounters: { last: 184, prior: 170 }, // no yearAgo → partial coverage
      yoyNote: 'Year-over-year is partial — the prior-year sheet matched only 1 of 2 metrics for June. Check that the prior-year workbook has the same June columns.',
    });
    render(<Reports />);
    expect(await screen.findByText(/year-over-year is partial/i)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1); // the absent Chiro YoY cell
  });
});

// MAD-54 — month picker: a dropdown to choose which month (default = the resolved latest-with-data),
// empty months labeled, changing it refetches with ?month=.
describe('Reports — month picker (MAD-54)', () => {
  function monthAwarePayload(selected: string) {
    return {
      weekNumber: 0,
      period: { current: 'June 2026', prior: 'May 2026' },
      metrics: [{ key: 'med', label: 'Medical', last: 120, prior: 110 }],
      encountersBySpecialty: [{ label: 'Medical', last: 120, prior: 110 }],
      totalEncounters: { last: 120, prior: 110 },
      availableMonths: [
        { key: '2026-07', label: 'July 2026', hasData: false },
        { key: '2026-06', label: 'June 2026', hasData: true },
        { key: '2026-05', label: 'May 2026', hasData: true },
      ],
      selectedMonth: selected,
    };
  }
  it('[AC-4] renders a month dropdown (empty labeled) and refetches with ?month= on change', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (req: RequestInfo | URL) => {
      const url = String(req);
      urls.push(url);
      if (url.includes('/api/reports/connection')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ connected: true, name: 'W.xlsx', via: 'connection' }) });
      if (url.includes('/api/auth/scopes')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ requested: [], delegated: [], app: [] }) });
      const m = new URL(url, 'http://x').searchParams.get('month') || '2026-06';
      return Promise.resolve({ ok: true, status: 200, json: async () => monthAwarePayload(m) });
    });
    render(<Reports />);
    const picker = await screen.findByLabelText(/month to view/i);
    expect(picker).toBeTruthy();
    expect(screen.getByText(/July 2026 — no data yet/i)).toBeTruthy(); // empty month labeled
    fireEvent.change(picker, { target: { value: '2026-05' } });
    await waitFor(() => expect(urls.some((u) => u.includes('month=2026-05'))).toBe(true));
  });
});

describe('Reports — Month | Week period toggle (MAD-51)', () => {
  it('[AC-6] shows a Month|Week toggle (default Month) and swaps period + numbers on Week', async () => {
    stubReports(REPORT_WITH_WEEKLY);
    render(<Reports />);
    // default Month view: the month period + the month label, with a toggle present
    expect(await screen.findByText(/June 2026 vs May 2026/)).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    const weekBtn = screen.getByRole('button', { name: /^week$/i });
    const monthBtn = screen.getByRole('button', { name: /^month$/i });
    expect(weekBtn && monthBtn).toBeTruthy();

    // switch to Week → weekly period label + the weekly column label
    fireEvent.click(weekBtn);
    await waitFor(() => expect(screen.getByText(/Week of Jun 22/)).toBeTruthy());
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.queryByText('This month')).toBeNull();

    // back to Month → restores the monthly labels
    fireEvent.click(monthBtn);
    await waitFor(() => expect(screen.getByText('This month')).toBeTruthy());
    expect(screen.queryByText(/Week of Jun 22/)).toBeNull();
  });

  it('[AC-6] shows NO toggle when the report has no weekly section', async () => {
    stubReports({ ...REPORT_WOW_ONLY, period: { current: 'June 2026', prior: 'May 2026' } });
    render(<Reports />);
    await screen.findByText(/Encounters by specialty/i);
    expect(screen.queryByRole('button', { name: /^week$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^month$/i })).toBeNull();
  });
});

describe('Reports — month-over-month comparison (MAD-28)', () => {
  it('[AC-2] shows a month-over-month column/indicator when month values are present', async () => {
    stubReports(REPORT_WITH_MOM);
    render(<Reports />);
    expect((await screen.findAllByText(/month.?over.?month|mom|vs last month/i)).length).toBeGreaterThanOrEqual(1);
    // WoW column still present.
    expect(screen.getByText('This month')).toBeTruthy();
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
    expect(await screen.findByText(/Encounters by specialty/i)).toBeTruthy();
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
    expect(screen.getByText('This month')).toBeTruthy();
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
    expect(await screen.findByText(/Encounters by specialty/i)).toBeTruthy();
    // …and no YoY treatment is shown.
    expect(screen.queryByText(/year.?over.?year|yoy|vs last year/i)).toBeNull();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
  });
});
