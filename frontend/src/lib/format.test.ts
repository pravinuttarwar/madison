import { describe, it, expect } from 'vitest';
import { usd, pctChange } from '@/lib/format';

// The Daily/Monday recap leans on these for every money figure and week-over-week delta.
describe('pctChange — week-over-week percentage', () => {
  it('rounds the signed percentage change', () => {
    expect(pctChange(1547, 1489)).toBe(4); // total encounters
    expect(pctChange(312380, 298640)).toBe(5); // deposits last week
    expect(pctChange(224940, 207440)).toBe(8); // net contribution
    expect(pctChange(58420, 54180)).toBe(8); // yesterday deposit
  });
  it('handles decreases and zero', () => {
    expect(pctChange(80, 100)).toBe(-20);
    expect(pctChange(100, 100)).toBe(0);
  });
  it('guards divide-by-zero (no prior) → 0, never NaN/Infinity', () => {
    expect(pctChange(100, 0)).toBe(0);
  });
});

describe('usd — governance-safe money formatting (never a "$" figure)', () => {
  it('abbreviates thousands to one decimal with a USD suffix', () => {
    expect(usd(312380)).toBe('312.4K USD');
    expect(usd(224940)).toBe('224.9K USD');
    expect(usd(58420)).toBe('58.4K USD');
  });
  it('drops a trailing .0 and shows sub-1000 values plainly', () => {
    expect(usd(2000)).toBe('2K USD');
    expect(usd(950)).toBe('950 USD');
    expect(usd(0)).toBe('0 USD');
  });
  it('formats magnitude (absolute value)', () => {
    expect(usd(-1200)).toBe('1.2K USD');
  });
});
