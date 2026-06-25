import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Reports from '@/pages/Reports';

afterEach(cleanup);

// MBI-37 (AC2): the providers' spreadsheet isn't wired yet, so a 503/failed read shows the
// "pending" beat rather than a raw error wall.
describe('Reports — not-connected pending state (MBI-37)', () => {
  it('shows the pending beat on a 503 (spreadsheet not connected)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) }),
    );
    render(<Reports />);
    expect(await screen.findByText('Pending implementation')).toBeTruthy();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
  });
});
