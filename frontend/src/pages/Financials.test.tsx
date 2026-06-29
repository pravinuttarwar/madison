import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ViewModeProvider, type ViewMode } from '@/context/view-mode';
import Financials from '@/pages/Financials';

afterEach(cleanup);

function renderFinancials(initialMode?: ViewMode) {
  return render(
    <ViewModeProvider initialMode={initialMode}>
      <Financials />
    </ViewModeProvider>,
  );
}

// Global view mode: the same mode the owner picks on the dashboard drives Financials'
// weekly-vs-daily layout (the previously-unreachable isMonday branch is now live).
describe('Financials — reflects the global view mode', () => {
  it('renders the weekly (Monday) layout in Monday mode', async () => {
    renderFinancials('monday');
    expect(await screen.findByText('Deposits (last week)')).toBeTruthy();
    expect(screen.queryByText('Deposit (yesterday)')).toBeNull();
  });

  it('renders the daily layout in weekday mode', async () => {
    renderFinancials('weekday');
    expect(await screen.findByText('Deposit (yesterday)')).toBeTruthy();
    expect(screen.queryByText('Deposits (last week)')).toBeNull();
  });
});

// [AC-3] MAD-23: an accrual-basis Revenue tile renders in both view-modes, labelled so
// the owner sees it differs from the cash-deposits figure (color-blind-safe — text label
// + icon, never colour alone).
describe('Financials — accrual revenue tile (MAD-23)', () => {
  it('[AC-3] renders the last-week Revenue tile in Monday mode with the accrual note', async () => {
    renderFinancials('monday');
    expect(await screen.findByText('Revenue (last week)')).toBeTruthy();
    expect(screen.getAllByText('Accrual basis · differs from deposits').length).toBeGreaterThan(0);
  });

  it('[AC-3] renders the month-to-date Revenue tile in weekday mode', async () => {
    renderFinancials('weekday');
    expect(await screen.findByText('Revenue (month-to-date)')).toBeTruthy();
  });
});

// MBI-35/38 (AC3): with the sample fallback gone and QuickBooks a real (sandbox) source,
// an unreachable backend surfaces the not-connected/Connect state — never sample numbers.
describe('Financials — graceful when the backend is unreachable (live-only)', () => {
  it('shows the QuickBooks connect prompt and no sample figures on a failed fetch', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) }),
    );
    renderFinancials('monday');
    expect(await screen.findByText("QuickBooks isn't connected")).toBeTruthy();
    // The old sample layout must NOT appear (no silent fallback to mock numbers).
    expect(screen.queryByText('Deposits (last week)')).toBeNull();
  });
});
