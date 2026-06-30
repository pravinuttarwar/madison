// Vitest global setup (MBI-35). Once the `@/lib/api` getters are live-only, every page
// fetches the backend — so the render tests need a deterministic, offline backend. This
// installs a `fetch` stub that serves the synthetic fixtures for the `/api/*` routes the
// app calls, mirroring the BFF contract. No network, no real backend, no PHI.
//
// A test can override `fetch` in its own beforeEach (the later stub wins) to assert a
// specific status/payload — e.g. api.test.ts proves the getters always hit the network.

import { beforeEach, afterEach, vi } from 'vitest';
import {
  dashboardMonday,
  dashboardWeekday,
  financialsFixture,
  meFixture,
} from './fixtures';

// Route a request path (+ query) to its fixture, or undefined for an unknown route.
export function apiFixtureFor(pathname: string, search: string): unknown {
  if (pathname === '/api/dashboard') {
    return search.includes('view=weekday') ? dashboardWeekday : dashboardMonday;
  }
  if (pathname === '/api/financials') return financialsFixture;
  if (pathname === '/api/me') return meFixture;
  if (pathname === '/api/email/awaiting') return dashboardMonday.awaiting;
  if (pathname === '/api/email') return dashboardMonday.emails;
  if (pathname.startsWith('/api/email/')) {
    const id = pathname.slice('/api/email/'.length);
    return dashboardMonday.emails.find((e) => e.id === id);
  }
  if (pathname === '/api/calendar') {
    return { today: dashboardMonday.schedule, week: dashboardMonday.weekCalendar };
  }
  // MAD-37: /api/tasks now returns the wrapper. Default stub = single-user (multiOwner:false).
  if (pathname === '/api/tasks') return { multiOwner: false, tasks: dashboardMonday.tasks };
  if (pathname === '/api/reports') {
    return {
      weekNumber: dashboardMonday.weekNumber,
      metrics: dashboardMonday.metrics,
      encountersBySpecialty: (dashboardMonday.metrics ?? [])
        .slice(0, 6)
        .map((m) => ({ label: m.label, last: m.last, prior: m.prior })),
      totalEncounters: dashboardMonday.totalEncounters,
    };
  }
  if (pathname === '/api/settings') {
    return { awaitingThresholdHours: dashboardMonday.awaitingThresholdHours };
  }
  // MAD-26: weekly-report workbook connection status (default = connected via env fallback).
  if (pathname === '/api/reports/connection') {
    return { connected: true, name: 'Madison Weekly Report.xlsx', source: 'env', via: 'env' };
  }
  return undefined;
}

// Minimal Response-like shape: the getters only read ok / status / statusText / json().
function fixtureResponse(url: string) {
  const { pathname, search } = new URL(url, 'http://test.local');
  const body = apiFixtureFor(pathname, search);
  if (body === undefined) {
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({ error: 'not_found' }) };
  }
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
    Promise.resolve(fixtureResponse(typeof input === 'string' ? input : input.toString())),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});
