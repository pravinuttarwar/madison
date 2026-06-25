import { describe, it, expect } from 'vitest';
import { defaultViewMode } from '@/context/view-mode';

// View selection AC: Monday → Monday view, any other weekday → Daily view, where
// "the day" is the PRACTICE's calendar day in America/New_York (MBI-27) — not the
// viewer's device timezone. Instants below are absolute (UTC `Z`), so every
// expectation is fixed regardless of the test runner's system TZ.
describe('defaultViewMode', () => {
  it('defaults to the Monday view on a Monday in the practice zone', () => {
    // 2026-06-29 11:00 in New York (15:00 UTC) is a Monday.
    expect(defaultViewMode(new Date('2026-06-29T15:00:00Z'))).toBe('monday');
  });

  it('defaults to the Daily (weekday) view on any other day in the practice zone', () => {
    expect(defaultViewMode(new Date('2026-06-30T15:00:00Z'))).toBe('weekday'); // Tuesday in NY
    expect(defaultViewMode(new Date('2026-07-04T15:00:00Z'))).toBe('weekday'); // Saturday in NY
    expect(defaultViewMode(new Date('2026-06-28T15:00:00Z'))).toBe('weekday'); // Sunday in NY
  });

  // MBI-27: the auto-default must follow the PRACTICE's calendar day (America/New_York),
  // not the viewer's device/UTC weekday — and stay stable across the runner's system TZ.
  it('pins "is it Monday?" to America/New_York, not the browser/UTC weekday', () => {
    // 2026-06-23T03:30Z is Mon 23:30 in New York but already Tuesday in UTC.
    expect(defaultViewMode(new Date('2026-06-23T03:30:00Z'))).toBe('monday');
    // 2026-06-22T03:00Z is Sun 23:00 in New York but already Monday in UTC (vice versa).
    expect(defaultViewMode(new Date('2026-06-22T03:00:00Z'))).toBe('weekday');
  });
});
