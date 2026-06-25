import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EmailQueue from '@/pages/EmailQueue';

afterEach(cleanup);

// Route /api/* to the given bodies (order: more specific paths first).
function stubApi({ emails, awaiting = [] }: { emails: unknown; awaiting?: unknown }) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    let body: unknown = {};
    if (url.includes('/api/email/awaiting')) body = awaiting;
    else if (url.includes('/api/email')) body = emails;
    else if (url.includes('/api/settings')) body = { awaitingThresholdHours: 48 };
    return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => body });
  });
}

// MBI-37 (AC3): an empty inbox is a friendly empty state, NOT an error wall. The
// follow-up engine stays visible so the page is still useful.
describe('EmailQueue — empty inbox (MBI-37)', () => {
  it('shows a friendly empty state (not the error view) when there are no emails', async () => {
    stubApi({ emails: [] });
    render(<EmailQueue />);
    expect(await screen.findByText('Inbox is clear')).toBeTruthy();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
    // The awaiting-response panel is still rendered.
    expect(screen.getByText('Awaiting response')).toBeTruthy();
  });

  it('still shows the error view on an actual fetch failure', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }),
    );
    render(<EmailQueue />);
    expect(await screen.findByText("Couldn't load this view")).toBeTruthy();
    expect(screen.queryByText('Inbox is clear')).toBeNull();
  });
});
