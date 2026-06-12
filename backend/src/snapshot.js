import { readFile, writeFile } from 'node:fs/promises';

// The ONE persisted thing — a handful of NON-PHI scalar KPIs per date, so we can show
// "up vs. yesterday". No line items, no patient data, no mail/financial detail. Plain
// integers keyed by YYYY-MM-DD. Stored next to the process; trivially capped/rotated.
const FILE = new URL('../.snapshot.json', import.meta.url);

async function load() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function recordToday(dateKey, scalars) {
  const all = await load();
  all[dateKey] = { ...(all[dateKey] || {}), ...scalars };
  // keep ~90 days max
  const keys = Object.keys(all).sort();
  while (keys.length > 90) delete all[keys.shift()];
  await writeFile(FILE, JSON.stringify(all));
}

export async function priorValue(dateKey, name) {
  const all = await load();
  const before = Object.keys(all)
    .filter((k) => k < dateKey)
    .sort();
  const prev = before[before.length - 1];
  return prev && all[prev] ? all[prev][name] : undefined;
}
