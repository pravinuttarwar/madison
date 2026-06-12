// Parser for Madison's "Patient Numbers" workbook (the Dr's real format).
//
// Each file = one year. Sheets come in pairs per month:
//   "<Month> Totals Madison"   → daily counts by specialty (Med/Chiro/Pod/PT/MA/IV),
//                                 a TOTAL row, plus Covid Test / Telehealth.
//   "<Month> Provider Totals"  → daily counts by provider (Lisa/Bachman/Nurse/…).
// Within a sheet, weeks are stacked vertically as blocks, each led by a "DATE" row.
//
// Tolerant by design: sheet-name typos ("Janurary", "Provier"), trailing spaces, and
// week-to-week provider changes are all handled. We sum only the columns the DATE row
// marks as dates, so a trailing "Total" column never double-counts.

import * as XLSX from 'xlsx';

const norm = (v) => String(v ?? '').trim();
const isDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());

// Friendly labels for the specialty codes (best-effort; unknown codes pass through).
export const SPECIALTY_NAMES = {
  Med: 'Medical',
  Chiro: 'Chiropractic',
  Pod: 'Podiatry',
  PT: 'Physical Therapy',
  MA: 'Medical Assistant',
  IV: 'IV Therapy',
};

// Parse one sheet (array-of-rows) into weekly blocks.
function parseSheetBlocks(rows) {
  const blocks = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] || [];
    if (norm(row[0]).toUpperCase() !== 'DATE') { i++; continue; }

    // Columns whose DATE-row cell is an actual date → the day columns to sum.
    const dateCols = [];
    let weekStart = null;
    for (let c = 1; c < row.length; c++) {
      if (isDate(row[c])) {
        dateCols.push(c);
        if (!weekStart || row[c] < weekStart) weekStart = row[c];
      }
    }

    const entries = {};
    let j = i + 1;
    for (; j < rows.length; j++) {
      const r = rows[j] || [];
      const label = norm(r[0]);
      const c1 = norm(r[1]).toUpperCase();
      if (label.toUpperCase() === 'DATE') break;            // next block
      if (r.every((c) => norm(c) === '')) break;            // blank separator → end
      if (!label && (c1 === 'MON' || c1 === 'TUES')) break; // next block's day header
      if (!label) continue;
      let sum = 0;
      for (const c of dateCols) if (typeof r[c] === 'number') sum += r[c];
      entries[label] = sum;
    }

    if (weekStart) blocks.push({ weekStart, entries });
    i = j;
  }
  return blocks;
}

// Build the normalized weekly series from a workbook buffer.
export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { cellDates: true });
  const weeks = new Map(); // weekStartISO → record

  for (const name of wb.SheetNames) {
    const lname = name.toLowerCase();
    const isProvider = lname.includes('provider') || lname.includes('provier');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true });
    for (const b of parseSheetBlocks(rows)) {
      const key = b.weekStart.toISOString().slice(0, 10);
      if (!weeks.has(key)) {
        weeks.set(key, { weekStart: key, specialties: {}, providers: {}, total: 0, covidTest: 0, telehealth: 0 });
      }
      const w = weeks.get(key);
      for (const [label, val] of Object.entries(b.entries)) {
        const lu = label.toUpperCase();
        if (isProvider) {
          if (lu === 'TOTAL') continue;
          w.providers[label] = (w.providers[label] || 0) + val;
        } else if (lu === 'TOTAL') {
          w.total = val;
        } else if (lu.startsWith('COVID')) {
          w.covidTest = val;
        } else if (lu.startsWith('TELE')) {
          w.telehealth = val;
        } else {
          w.specialties[label] = (w.specialties[label] || 0) + val;
        }
      }
    }
  }

  const series = [...weeks.values()]
    .filter((w) => w.total > 0 || Object.keys(w.specialties).length || Object.keys(w.providers).length)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  return series;
}

// Shape the parsed series into the Reports DTO: latest populated week + week-over-week.
// `asOf` lets callers/tests pin "today"; defaults to the real current date.
export function reportFromWorkbook(buffer, asOf = new Date()) {
  const all = parseWorkbook(buffer);
  // Ignore empty template weeks and any week dated in the future — the latest REAL,
  // already-happened week is what the report should show.
  const cutoff = new Date(asOf); cutoff.setHours(23, 59, 59, 999);
  const hasData = (w) =>
    w.total > 0 ||
    Object.values(w.specialties).some((v) => v > 0) ||
    Object.values(w.providers).some((v) => v > 0);
  const series = all.filter((w) => hasData(w) && new Date(w.weekStart) <= cutoff);
  if (!series.length) {
    const err = new Error('spreadsheet_format_unrecognized');
    err.code = 'FORMAT';
    throw err;
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2] || null;

  const delta = (cur, prior) => (prior == null ? null : cur - prior);
  const specialties = Object.keys(last.specialties).map((key) => ({
    key,
    label: SPECIALTY_NAMES[key] || key,
    last: last.specialties[key],
    prior: prev ? prev.specialties[key] ?? 0 : null,
  }));
  const providers = Object.keys(last.providers)
    .map((name) => ({
      name,
      last: last.providers[name],
      prior: prev ? prev.providers[name] ?? 0 : null,
    }))
    .sort((a, b) => b.last - a.last);

  const totalLast = last.total || specialties.reduce((s, x) => s + x.last, 0);
  const totalPrior = prev ? (prev.total || Object.values(prev.specialties).reduce((s, x) => s + x, 0)) : null;

  return {
    weekStart: last.weekStart,
    priorWeekStart: prev ? prev.weekStart : null,
    totalEncounters: { last: totalLast, prior: totalPrior },
    specialties,
    providers,
    covidTest: { last: last.covidTest, prior: prev ? prev.covidTest : null },
    telehealth: { last: last.telehealth, prior: prev ? prev.telehealth : null },
    weeksAvailable: series.length,
    _delta: delta, // (unused export marker; kept for clarity)
  };
}
