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
