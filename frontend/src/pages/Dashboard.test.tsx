import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ViewModeProvider, type ViewMode } from '@/context/view-mode';
import { UserProvider } from '@/context/UserContext';
import Dashboard, { MondayView } from '@/pages/Dashboard';
import { getDashboard } from '@/lib/api';

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
    const data = await getDashboard('monday'); // real sample shape (mock mode)
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
});
