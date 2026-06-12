// Money formatting for the prototype.
// Governance: NEVER emit a "$"-prefixed number. Lead with a trend; show magnitude
// only in a non-"$" form ("58.4K USD"), and make clear it is sample data.
export function usd(n: number): string {
  const abs = Math.abs(n);
  let val: string;
  if (abs >= 1000) {
    val = (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    val = String(abs);
  }
  return `${val} USD`;
}

// Percentage change, rounded, for trend badges.
export function pctChange(last: number, prior: number): number {
  if (prior === 0) return 0;
  return Math.round(((last - prior) / prior) * 100);
}
