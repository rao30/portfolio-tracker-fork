const PALETTE = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#fb923c',
  '#60a5fa',
  '#e879f9',
];

/** Hash a string to a stable palette index. */
function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic chart color for a property name. */
export function propertyColor(name: string): string {
  return PALETTE[hashName(name) % PALETTE.length];
}

/** Format a number as USD currency. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Tailwind text color for signed cashflow values. */
export function cashflowToneClass(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-slate-400';
}

/** Format a decimal rate as a percentage string. */
export function formatPercent(rate: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(rate);
}

/** Format LTV as a percentage (0–100+). */
export function formatLtv(ltv: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(ltv);
}

/** Compact currency for chart axes. */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

/** Format months as a human-readable duration. */
export function formatMonths(months: number): string {
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

/** Calendar year index (1-based) for a simulation month. */
export function yearFromMonth(month: number): number {
  return Math.floor((month - 1) / 12) + 1;
}

/** Calendar year for a simulation month given the anchor year for month 1. */
export function calendarYearFromMonth(month: number, anchorYear: number): number {
  return anchorYear + yearFromMonth(month) - 1;
}

/** Simulation month (1-based) for a calendar year/month vs portfolio anchor. */
export function calendarToSimMonth(
  year: number,
  month: number,
  anchorYear: number,
  anchorMonth = 1,
): number {
  return (year - anchorYear) * 12 + (month - anchorMonth) + 1;
}

/** Calendar year/month for a simulation month given the anchor date for month 1. */
export function simMonthToCalendar(
  simMonth: number,
  anchorYear: number,
  anchorMonth = 1,
): { year: number; month: number } {
  const zeroBased = anchorMonth - 1 + simMonth - 1;
  return {
    year: anchorYear + Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

/** Simulation month for today's calendar date vs portfolio anchor. */
export function currentSimulationMonth(
  anchorYear: number,
  anchorMonth = 1,
  asOf = new Date(),
): number {
  return calendarToSimMonth(
    asOf.getFullYear(),
    asOf.getMonth() + 1,
    anchorYear,
    anchorMonth,
  );
}

/** Simulation month when a property closes in January of closeYear. */
export function closeMonthFromYear(
  closeYear: number,
  anchorYear: number,
  anchorMonth = 1,
): number {
  return calendarToSimMonth(closeYear, 1, anchorYear, anchorMonth);
}

/** Month within the calendar year (1–12). */
export function monthInYear(month: number): number {
  return ((month - 1) % 12) + 1;
}

/** Tick positions for month axes with year markers. */
export function buildTimelineTicks(maxMonth: number): number[] {
  if (maxMonth <= 0) return [0];

  const ticks = new Set<number>([1, maxMonth]);
  const yearStep = maxMonth > 180 ? 24 : 12;

  for (let m = yearStep; m < maxMonth; m += yearStep) {
    ticks.add(m);
  }

  if (maxMonth <= 96) {
    for (let m = 6; m < maxMonth; m += 6) {
      ticks.add(m);
    }
  }

  return [...ticks].sort((a, b) => a - b);
}
