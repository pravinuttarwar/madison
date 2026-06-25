import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserProvider } from '@/context/UserContext';
import Login from '@/pages/Login';

afterEach(cleanup);

function renderLogin() {
  return render(
    <MemoryRouter>
      <UserProvider>
        <Login />
      </UserProvider>
    </MemoryRouter>,
  );
}

// MBI-38: live-only auth — the login screen always offers the real Microsoft sign-in,
// never a "Demo mode — using sample data" shortcut.
describe('Login — live-only sign-in (MBI-38)', () => {
  it('shows the Microsoft 365 sign-in button', () => {
    renderLogin();
    expect(screen.getByText('Continue with Microsoft 365')).toBeTruthy();
  });

  it('does not offer a demo / sample-data entry', () => {
    renderLogin();
    expect(screen.queryByText(/demo mode/i)).toBeNull();
    expect(screen.queryByText(/sample data/i)).toBeNull();
  });
});
