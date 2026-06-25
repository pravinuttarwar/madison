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
});
