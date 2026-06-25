import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEmails,
  getEmail,
  getAwaiting,
  getCalendar,
  getTasks,
  getFinancials,
  getReports,
  getDashboard,
  getMe,
  getSettings,
  getSourceStatus,
  sourceModeFor,
} from '@/lib/api';

// MBI-35: the getters are LIVE-ONLY — every one hits the backend route, with no
// sample/mock fallback. We prove this by stubbing fetch to return a SENTINEL that the
// runtime mock never contains: if a getter returned mock data it would not equal the
// sentinel, and fetch would not have been called. (The vitest env pins
// VITE_LIVE_SOURCES='' — under the old fallback these getters returned mock and never
// fetched, so these assertions failed.)

let calls: string[];
const SENTINEL = { __sentinel: 'from-backend' };

beforeEach(() => {
  calls = [];
  // Override the global offline stub with a recording one returning the sentinel.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => SENTINEL });
    }),
  );
});

describe('lib/api — live-only getters always fetch the backend (MBI-35)', () => {
  const cases: [string, () => Promise<unknown>, string][] = [
    ['getEmails', getEmails, '/api/email'],
    ['getEmail', () => getEmail('e1'), '/api/email/e1'],
    ['getAwaiting', getAwaiting, '/api/email/awaiting'],
    ['getCalendar', getCalendar, '/api/calendar'],
    ['getTasks', getTasks, '/api/tasks'],
    ['getFinancials', getFinancials, '/api/financials'],
    ['getReports', getReports, '/api/reports'],
    ['getDashboard', () => getDashboard('monday'), '/api/dashboard?view=monday'],
    ['getMe', getMe, '/api/me'],
    ['getSettings', getSettings, '/api/settings'],
  ];

  for (const [name, getter, route] of cases) {
    it(`${name} fetches ${route} and returns the backend payload (no mock fallback)`, async () => {
      const result = await getter();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain(route);
      expect(result).toEqual(SENTINEL);
    });
  }
});

// MBI-38: the runtime sample path is gone, so the source-status model has only two real
// states — sandbox | live. 'mock' is removed. Under the default env (no VITE_LIVE_MODE)
// the deployment is on the sandbox apps, so every source reports 'sandbox'.
describe('lib/api — source modes are sandbox|live, never mock (MBI-38)', () => {
  it('getSourceStatus reports only sandbox/live and defaults to sandbox', async () => {
    const statuses = await getSourceStatus();
    expect(statuses.length).toBe(4);
    for (const s of statuses) {
      expect(['sandbox', 'live']).toContain(s.mode);
      expect(s.mode).toBe('sandbox'); // default env (VITE_LIVE_MODE unset)
    }
  });

  it('sourceModeFor never returns mock', () => {
    for (const id of ['outlook', 'microsoftToDo', 'quickbooks', 'spreadsheet'] as const) {
      expect(sourceModeFor(id)).not.toBe('mock');
    }
  });
});
