import { describe, it, expect } from 'vitest';
import * as data from '@/lib/data';

// MBI-35: lib/data is a TYPES (+ a few UI constants) module — the runtime sample data
// arrays are gone from the bundle (the live BFF is the only data source now). Accessed
// dynamically so this test compiles whether or not the names still exist.
const bag = data as Record<string, unknown>;

describe('lib/data — runtime sample arrays removed (MBI-35)', () => {
  const REMOVED = [
    'EMAILS',
    'AWAITING_RESPONSE',
    'TODAY_SCHEDULE',
    'WEEK_CALENDAR',
    'TASKS',
    'WEEKLY_METRICS',
    'ENCOUNTERS_BY_SPECIALTY',
    'WEEKLY_FINANCIAL',
    'DAILY_FINANCIAL',
    'PRIORITY_WEEK',
    'PRIORITY_TODAY',
    'WEEK_NUMBER',
    'TOTAL_ENCOUNTERS',
  ];

  for (const name of REMOVED) {
    it(`no longer exports the sample value "${name}"`, () => {
      expect(bag[name]).toBeUndefined();
    });
  }

  it('still exports the kept UI constants (OWNER, DATES)', () => {
    expect(bag.OWNER).toBe('Dr. Romano');
    expect(bag.DATES).toBeTruthy();
  });
});
