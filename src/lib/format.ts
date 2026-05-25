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

/** Format a decimal rate as a percentage string. */
export function formatPercent(rate: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(rate);
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
