import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from '@/App';

afterEach(cleanup);

// MBI-37 (AC2): a 401 on the auth probe routes the app to the Microsoft sign-in, rather
// than rendering an authed page with no data. (Dedicated file → fresh UserContext module
// state, so the single getMe probe resolves to "not signed in".)
describe('App — 401 routes to sign-in (MBI-37)', () => {
  it('shows the Microsoft sign-in when /api/me returns 401', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: 'not_authenticated' }) }),
    );
    render(<App />);
    expect(await screen.findByText('Continue with Microsoft 365')).toBeTruthy();
  });
});
