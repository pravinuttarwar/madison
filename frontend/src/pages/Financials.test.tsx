import { afterEach, describe, it, expect } from 'vitest';
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
