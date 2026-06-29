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

// MAD-29 — year-over-year comparison (thin additive on the named-range model).
const REPORT_WITH_YOY = {
  weekNumber: 16,
  metrics: [
    { key: 'newPatients', label: 'New patients', last: 22, prior: 18, yearAgo: 15 },
    { key: 'medicalSeen', label: 'Medical seen', last: 284, prior: 271, yearAgo: 250 },
  ],
  encountersBySpecialty: [
    { label: 'New patients', last: 22, prior: 18, yearAgo: 15 },
    { label: 'Medical seen', last: 284, prior: 271, yearAgo: 250 },
  ],
  totalEncounters: { last: 306, prior: 289, yearAgo: 265 },
};
const REPORT_WOW_ONLY = {
  weekNumber: 16,
  metrics: [{ key: 'newPatients', label: 'New patients', last: 22, prior: 18 }],
  encountersBySpecialty: [{ label: 'New patients', last: 22, prior: 18 }],
  totalEncounters: { last: 22, prior: 18 },
};

function stubReports(payload: unknown) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => payload }),
  );
}

describe('Reports — year-over-year comparison (MAD-29)', () => {
  it('[AC-2] shows a year-over-year column/indicator when year-ago values are present', async () => {
    stubReports(REPORT_WITH_YOY);
    render(<Reports />);
    // A YoY treatment appears, distinct from the week-over-week "Prior" column.
    expect((await screen.findAllByText(/year.?over.?year|yoy|vs last year/i)).length).toBeGreaterThanOrEqual(1);
    // The week-over-week column is still there (unique table header).
    expect(screen.getByText('Last week')).toBeTruthy();
  });

  it('[AC-4] encounters-by-specialty reflects the year-ago comparison', async () => {
    stubReports(REPORT_WITH_YOY);
    render(<Reports />);
    const panel = await screen.findByText('Encounters by specialty');
    // The section renders without error and shows the YoY treatment somewhere in the page.
    expect(panel).toBeTruthy();
    expect(screen.getAllByText(/year.?over.?year|yoy|vs last year/i).length).toBeGreaterThanOrEqual(1);
  });

  it('[AC-3] renders week-over-week exactly as before when no year-ago values (no YoY column, no error)', async () => {
    stubReports(REPORT_WOW_ONLY);
    render(<Reports />);
    // WoW view intact…
    expect(await screen.findByText(/last week/i)).toBeTruthy();
    // …and no YoY treatment is shown.
    expect(screen.queryByText(/year.?over.?year|yoy|vs last year/i)).toBeNull();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
  });
});
