import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

// MBI-21 — light mode is removed (the owner wants a single dark mode). The Display &
// Accessibility menu must no longer expose a Light/Dark theme control; the only display
// preference is the Color-Vision-Friendly palette.
describe('Display & Accessibility menu — light/dark control removed (MBI-21)', () => {
  it('opens to a Colors (color-vision) toggle but no Light/Dark theme control', () => {
    renderShell();
    fireEvent.click(screen.getByTitle('Display & Accessibility'));

    // The color-vision preference remains.
    expect(screen.getByText('Colors')).toBeTruthy();
    expect(screen.getByText('Color-Vision Friendly')).toBeTruthy();

    // The Light/Dark theme toggle is gone.
    expect(screen.queryByText('Theme')).toBeNull();
    expect(screen.queryByText('Light')).toBeNull();
    expect(screen.queryByText('Dark')).toBeNull();
  });
});
