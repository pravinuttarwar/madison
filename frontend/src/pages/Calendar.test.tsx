import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Calendar from '@/pages/Calendar';

afterEach(cleanup);

// MBI-37 (AC1): the Calendar degrades cleanly — a friendly empty state for zero events
// and an error view on a failed fetch, never a blank panel.
describe('Calendar — empty + error states (MBI-37)', () => {
  it('shows friendly empty states when there are no events', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ today: [], week: [] }) }),
    );
    render(<Calendar />);
    expect(await screen.findByText('No events scheduled for today.')).toBeTruthy();
    expect(screen.getByText('No events this week in your calendar.')).toBeTruthy();
  });

  it('shows the error view on a failed fetch', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }),
    );
    render(<Calendar />);
    expect(await screen.findByText("Couldn't load this view")).toBeTruthy();
  });
});
