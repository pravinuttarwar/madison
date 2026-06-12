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

const weekTotal = (w) => w.total || Object.values(w.specialties).reduce((a, b) => a + b, 0);
const hasData = (w) =>
  weekTotal(w) > 0 || Object.values(w.providers).some((v) => v > 0);

// Merge weekly series from multiple files; on a duplicate week, keep the richer one.
function mergeSeries(parsedList) {
  const map = new Map();
  for (const weeks of parsedList) {
    for (const w of weeks) {
      const ex = map.get(w.weekStart);
      if (!ex || weekTotal(w) > weekTotal(ex)) map.set(w.weekStart, w);
    }
  }
  return [...map.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

const monthKey = (iso) => iso.slice(0, 7); // YYYY-MM
const monthLabel = (mk) =>
  new Date(mk + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// Group weeks into calendar months (sum totals + per-modality).
function byMonth(series) {
  const m = new Map();
  for (const w of series) {
    const k = monthKey(w.weekStart);
    if (!m.has(k)) m.set(k, { month: k, label: monthLabel(k), total: 0, modalities: {} });
    const rec = m.get(k);
    rec.total += weekTotal(w);
    for (const [code, v] of Object.entries(w.specialties)) rec.modalities[code] = (rec.modalities[code] || 0) + v;
  }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

// Aggregate a set of weeks → total + per-modality + per-provider (for side-by-side).
function aggregate(weeks) {
  const modalities = {};
  const providers = {};
  let total = 0;
  for (const w of weeks) {
    total += weekTotal(w);
    for (const [k, v] of Object.entries(w.specialties)) modalities[k] = (modalities[k] || 0) + v;
    for (const [k, v] of Object.entries(w.providers)) providers[k] = (providers[k] || 0) + v;
  }
  return { total, modalities, providers };
}

// Build the comparable periods (each year + each month) keyed for the compare UI.
function buildPeriods(series) {
  const yearGroups = new Map();
  const monthGroups = new Map();
  for (const w of series) {
    const y = w.weekStart.slice(0, 4);
    const mk = monthKey(w.weekStart);
    (yearGroups.get(y) || yearGroups.set(y, []).get(y)).push(w);
    (monthGroups.get(mk) || monthGroups.set(mk, []).get(mk)).push(w);
  }
  const periods = {};
  const years = [];
  for (const [y, ws] of [...yearGroups].sort()) {
    periods[`year:${y}`] = { id: `year:${y}`, kind: 'year', label: y, ...aggregate(ws) };
    years.push(y);
  }
  const months = [];
  for (const [mk, ws] of [...monthGroups].sort()) {
    periods[`month:${mk}`] = { id: `month:${mk}`, kind: 'month', label: monthLabel(mk), ...aggregate(ws) };
    months.push(mk);
  }
  return { periods, available: { years, months } };
}

// Build the full Reports DTO from one or more parsed weekly series.
// Latest week (W/W) + monthly trend (M/M) + year-over-year, blanks skipped.
export function buildReport(parsedList, asOf = new Date()) {
  const cutoff = new Date(asOf); cutoff.setHours(23, 59, 59, 999);
  const series = mergeSeries(parsedList).filter((w) => hasData(w) && new Date(w.weekStart) <= cutoff);
  if (!series.length) {
    const err = new Error('spreadsheet_format_unrecognized');
    err.code = 'FORMAT';
    throw err;
  }

  // ── latest week + week-over-week (skip all-zero rows) ──
  const last = series[series.length - 1];
  const prev = series[series.length - 2] || null;
  const row = (cur, prior) => prior == null ? null : cur - prior;
  const modalities = Object.keys(last.specialties)
    .map((key) => ({ key, label: SPECIALTY_NAMES[key] || key, last: last.specialties[key], prior: prev ? prev.specialties[key] ?? 0 : null }))
    .filter((s) => s.last > 0 || (s.prior ?? 0) > 0)
    .sort((a, b) => b.last - a.last);
  const providers = Object.keys(last.providers)
    .map((name) => ({ name, last: last.providers[name], prior: prev ? prev.providers[name] ?? 0 : null }))
    .filter((p) => p.last > 0 || (p.prior ?? 0) > 0)
    .sort((a, b) => b.last - a.last);

  // ── monthly trend (last 12 months with data) ──
  const months = byMonth(series).filter((m) => m.total > 0).slice(-12);

  // ── year-over-year: latest month vs the same month a year earlier ──
  let yoy = null;
  const allMonths = byMonth(series);
  const latestMonth = allMonths.filter((m) => m.total > 0).pop();
  if (latestMonth) {
    const [y, mo] = latestMonth.month.split('-');
    const priorKey = `${Number(y) - 1}-${mo}`;
    const priorMonth = allMonths.find((m) => m.month === priorKey) || null;
    if (priorMonth && priorMonth.total > 0) {
      const codes = [...new Set([...Object.keys(latestMonth.modalities), ...Object.keys(priorMonth.modalities)])];
      yoy = {
        label: `${monthLabel(latestMonth.month)} vs ${monthLabel(priorMonth.month)}`,
        total: { last: latestMonth.total, prior: priorMonth.total },
        modalities: codes
          .map((c) => ({ key: c, label: SPECIALTY_NAMES[c] || c, last: latestMonth.modalities[c] || 0, prior: priorMonth.modalities[c] || 0 }))
          .filter((x) => x.last > 0 || x.prior > 0)
          .sort((a, b) => b.last - a.last),
      };
    }
  }

  // ── per-year monthly matrix (Jan–Dec totals per year) → multi-line YoY chart ──
  const years = [...new Set(series.map((w) => w.weekStart.slice(0, 4)))].sort();
  const totalsByYear = {};
  for (const y of years) totalsByYear[y] = Array(12).fill(0);
  for (const w of series) {
    totalsByYear[w.weekStart.slice(0, 4)][Number(w.weekStart.slice(5, 7)) - 1] += weekTotal(w);
  }
  const yearMonthly = { years, totals: totalsByYear };

  // ── comparable periods (each year + each month) for the side-by-side selector ──
  const { periods, available } = buildPeriods(series);

  const totalLast = weekTotal(last);
  const totalPrior = prev ? weekTotal(prev) : null;
  return {
    week: {
      weekStart: last.weekStart,
      priorWeekStart: prev ? prev.weekStart : null,
      totalEncounters: { last: totalLast, prior: totalPrior },
      modalities,
      providers,
      covidTest: { last: last.covidTest, prior: prev ? prev.covidTest : null },
      telehealth: { last: last.telehealth, prior: prev ? prev.telehealth : null },
    },
    months: months.map((m) => ({ month: m.month, label: m.label, total: m.total })),
    yoy,
    yearMonthly,
    periods,
    available,
    modalityNames: SPECIALTY_NAMES,
    weeksAvailable: series.length,
    _delta: row, // retained marker
  };
}

// Single-file convenience (kept for the probe/tests).
export function reportFromWorkbook(buffer, asOf = new Date()) {
  return buildReport([parseWorkbook(buffer)], asOf);
}
