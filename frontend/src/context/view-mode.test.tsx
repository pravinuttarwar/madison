import { describe, it, expect } from 'vitest';
import { defaultViewMode } from '@/context/view-mode';

// View selection AC: Monday → Monday view, any other weekday → Daily view.
describe('defaultViewMode', () => {
  it('defaults to the Monday view on a Monday', () => {
    // 2026-06-29 is a Monday.
    expect(defaultViewMode(new Date('2026-06-29T09:00:00'))).toBe('monday');
  });

  it('defaults to the Daily (weekday) view on any other day', () => {
    expect(defaultViewMode(new Date('2026-06-30T09:00:00'))).toBe('weekday'); // Tuesday
    expect(defaultViewMode(new Date('2026-07-04T09:00:00'))).toBe('weekday'); // Saturday
    expect(defaultViewMode(new Date('2026-06-28T09:00:00'))).toBe('weekday'); // Sunday
  });

  it('keys off the LOCAL weekday at any time of day (timezone-stable)', () => {
    // Numeric constructor = local time, so getDay() is the user's local weekday
    // regardless of the runner's system timezone. June 22 2026 is a Monday.
    expect(defaultViewMode(new Date(2026, 5, 22, 0, 30))).toBe('monday'); // Mon 00:30 local
    expect(defaultViewMode(new Date(2026, 5, 22, 23, 30))).toBe('monday'); // Mon 23:30 local
    expect(defaultViewMode(new Date(2026, 5, 21, 23, 59))).toBe('weekday'); // Sun, just before Mon
    expect(defaultViewMode(new Date(2026, 5, 23, 0, 1))).toBe('weekday'); // Tue, just after Mon
  });
});
