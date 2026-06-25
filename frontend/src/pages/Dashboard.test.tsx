import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ViewModeProvider, type ViewMode } from '@/context/view-mode';
import { UserProvider } from '@/context/UserContext';
import Dashboard, { MondayView, CategoryBadge } from '@/pages/Dashboard';
import { type DashboardData } from '@/lib/api';
import { dashboardMonday } from '@/test/fixtures';
import type { EmailCategory } from '@/lib/data';

afterEach(cleanup);

function renderDashboard(initialMode?: ViewMode) {
  return render(
    <MemoryRouter>
      <UserProvider>
        <ViewModeProvider initialMode={initialMode}>
          <Dashboard />
        </ViewModeProvider>
      </UserProvider>
    </MemoryRouter>,
  );
}

describe('Dashboard — Daily vs Monday composition', () => {
  it('Daily view renders the existing TodayView (no regression)', async () => {
    renderDashboard('weekday');
    expect(await screen.findByText(/Good morning/)).toBeTruthy();
    // Daily-only marker: yesterday's performance.
    expect(screen.getByText('Yesterday deposit')).toBeTruthy();
  });

  it("Monday view shows the previous-week recap and this Monday's priorities", async () => {
    renderDashboard('monday');
    // Weekly recap: total encounters + the weekly financial summary.
    expect(await screen.findByText('Total encounters')).toBeTruthy();
    expect(screen.getByText('Deposits (last week)')).toBeTruthy();
    // The full week-over-week metrics table.
    expect(screen.getByText('Weekly metrics')).toBeTruthy();
    // This Monday's priorities (priorityToday).
    expect(screen.getByText("This week's priorities")).toBeTruthy();
    // It is NOT the Daily view.
    expect(screen.queryByText('Yesterday deposit')).toBeNull();
  });

  it('Monday view renders QuickBooks + spreadsheet figures with correct week-over-week deltas', async () => {
    const data = dashboardMonday; // full sample: financialWeek + metrics + totalEncounters
    render(
      <MemoryRouter>
        <UserProvider>
          <MondayView data={data} />
        </UserProvider>
      </MemoryRouter>,
    );
    // Total encounters (spreadsheet) — locale-formatted value…
    expect(screen.getByText('1,547')).toBeTruthy();
    // Deposits last week + net contribution (QuickBooks) — usd()-formatted…
    expect(screen.getByText('312.4K USD')).toBeTruthy();
    expect(screen.getAllByText('224.9K USD').length).toBeGreaterThan(0);
    // …and the week-over-week % is actually wired into the trend badge (pctChange(312380,298640)=5).
    expect(screen.getByText((_, el) => el?.textContent === '+5%')).toBeTruthy();
    // The full week-over-week metrics table renders real spreadsheet rows.
    expect(screen.getByText('Chiropractic seen')).toBeTruthy();
    expect(screen.getByText('612')).toBeTruthy();
    expect(screen.getByText('598')).toBeTruthy();
    // Outlook schedule + Microsoft To Do priority (the live-present sources) render.
    expect(screen.getByText('Clinic open / staff huddle')).toBeTruthy();
    expect(screen.getByText('Sign off peptide handout v3')).toBeTruthy();
  });

  it('Daily view renders the QuickBooks yesterday-deposit value/delta and an Outlook email', async () => {
    renderDashboard('weekday');
    // QuickBooks yesterday deposit — usd(58420) + WoW % (pctChange(58420,54180)=8).
    expect(await screen.findByText('58.4K USD')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === '+8%')).toBeTruthy();
    // Outlook email triage shows a real sender.
    expect(screen.getByText('Practice manager')).toBeTruthy();
  });
});

describe('Dashboard — email category briefing (MBI-19)', () => {
  it('tags each important email with an icon + text category (never color alone)', async () => {
    renderDashboard('weekday');
    await screen.findByText(/Good morning/);

    // The important emails on the briefing span all three category buckets, each shown
    // as a text label (not color alone).
    const actionNeeded = screen.getAllByText('Action needed');
    expect(actionNeeded.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Management').length).toBeGreaterThan(0);
    expect(screen.getByText('Operational')).toBeTruthy();

    // …and each label is paired with an icon (svg) inside the same badge — so the
    // category is conveyed by icon + text, satisfying the color-blind requirement.
    expect(actionNeeded[0].querySelector('svg')).toBeTruthy();
  });
});

describe('Dashboard — CategoryBadge degrades gracefully', () => {
  it('renders a known category as its label + icon', () => {
    render(<CategoryBadge category="management" />);
    expect(screen.getByText('Management')).toBeTruthy();
  });

  it('falls back to "Action needed" (never crashes) for a missing/unknown category', () => {
    // Mirrors a live Graph email arriving without a recognized category.
    const { container } = render(
      <CategoryBadge category={undefined as unknown as EmailCategory} />,
    );
    expect(screen.getByText('Action needed')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('Dashboard — view toggle', () => {
  it('switches Daily↔Monday and marks the active view by state (not color alone)', async () => {
    renderDashboard('weekday');
    await screen.findByText(/Good morning/);

    const dailyBtn = screen.getByRole('button', { name: /daily/i });
    const mondayBtn = screen.getByRole('button', { name: /monday/i });
    // Active view conveyed via aria-pressed — a non-color, keyboard-exposed signal.
    expect(dailyBtn.getAttribute('aria-pressed')).toBe('true');
    expect(mondayBtn.getAttribute('aria-pressed')).toBe('false');

    // Switch to Monday.
    fireEvent.click(mondayBtn);
    expect(await screen.findByText('Total encounters')).toBeTruthy();
    expect(screen.getByRole('button', { name: /monday/i }).getAttribute('aria-pressed')).toBe('true');

    // And back to Daily.
    fireEvent.click(screen.getByRole('button', { name: /daily/i }));
    expect(await screen.findByText('Yesterday deposit')).toBeTruthy();
  });
});

describe('Dashboard — null-safety when QuickBooks is not connected', () => {
  it('Monday view with financialWeek null shows a not-connected state, never crashes', async () => {
    const data = dashboardMonday; // real sample shape (mock mode)
    const noQbo = { ...data, financialWeek: null };
    render(
      <MemoryRouter>
        <UserProvider>
          <MondayView data={noQbo} />
        </UserProvider>
      </MemoryRouter>,
    );
    // The clinical recap still renders…
    expect(screen.getByText('Total encounters')).toBeTruthy();
    // …and the financial tiles/panel degrade to a not-connected state.
    expect(screen.getAllByText('QuickBooks not connected').length).toBeGreaterThan(0);
  });

  it('Monday view survives live data missing the spreadsheet fields (metrics/totalEncounters undefined)', async () => {
    const data = dashboardMonday;
    // Mirror the live BFF shape when the providers' spreadsheet isn't wired.
    const noSpreadsheet: DashboardData = {
      ...data,
      metrics: undefined,
      totalEncounters: undefined,
      weekNumber: undefined,
    };
    render(
      <MemoryRouter>
        <UserProvider>
          <MondayView data={noSpreadsheet} />
        </UserProvider>
      </MemoryRouter>,
    );
    // No crash: the live-present sections still render…
    expect(screen.getByText("This week's priorities")).toBeTruthy();
    // …and the weekly-report section degrades to a not-connected state.
    expect(screen.getAllByText(/weekly report not connected/i).length).toBeGreaterThan(0);
  });
});
