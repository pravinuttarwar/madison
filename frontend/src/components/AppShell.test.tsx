import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserProvider } from '@/context/UserContext';
import AppShell from '@/components/AppShell';

afterEach(cleanup);

function renderShell() {
  return render(
    <MemoryRouter>
      <UserProvider>
        <AppShell>
          <div>content</div>
        </AppShell>
      </UserProvider>
    </MemoryRouter>,
  );
}

// MBI-41 — the Display & Accessibility control is removed. The color-vision-friendly
// palette stays the default (applied at boot in main.tsx via theme.ts), so there is no
// in-app toggle for it anymore. See theme.test.ts for the default-on behavior.
describe('Display & Accessibility menu — removed (MBI-41)', () => {
  it('renders no Display & Accessibility control in the header', () => {
    renderShell();

    // The trigger button (by title and by its visible "Display" label) is gone.
    expect(screen.queryByTitle('Display & Accessibility')).toBeNull();
    expect(screen.queryByText('Display')).toBeNull();

    // The Colors toggle it hosted is gone with it.
    expect(screen.queryByText('Colors')).toBeNull();
    expect(screen.queryByText('Color-Vision Friendly')).toBeNull();
    expect(screen.queryByText('Standard')).toBeNull();
  });

  it('still renders the rest of the app chrome (nav + content)', () => {
    renderShell();
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });
});
