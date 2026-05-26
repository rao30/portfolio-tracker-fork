import type { SimulationResult } from './types';

/** Newton-Raphson IRR on monthly cashflows (final month includes terminal equity). */
export function computeIrr(cashflows: number[]): number | null {
  if (cashflows.length < 2) return null;
  const hasPos = cashflows.some((c) => c > 0);
  const hasNeg = cashflows.some((c) => c < 0);
  if (!hasPos || !hasNeg) return null;

  let rate = 0.01;
  for (let i = 0; i < 100; i += 1) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t += 1) {
      const factor = Math.pow(1 + rate, t);
      npv += cashflows[t] / factor;
      if (t > 0) {
        dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
      }
    }
    if (Math.abs(npv) < 1e-6) return rate * 12;
    if (Math.abs(dnpv) < 1e-12) break;
    rate -= npv / dnpv;
    if (rate <= -0.99) rate = -0.5;
  }
  return rate * 12;
}

export function computeNpv(cashflows: number[], annualDiscountRate: number): number {
  const r = annualDiscountRate / 12;
  return cashflows.reduce(
    (sum, cf, t) => sum + cf / Math.pow(1 + r, t),
    0,
  );
}

export function equityMultiple(initialEquity: number, result: SimulationResult): number {
  if (initialEquity <= 0) return 0;
  const cumulativeCf = result.history.reduce((s, h) => {
    return s + Math.max(0, h.monthlyCashflow);
  }, 0);
  return (result.finalEquity + cumulativeCf) / initialEquity;
}

export interface MonteCarloBand {
  month: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloOptions {
  runs?: number;
  appreciationBand?: number;
  rentGrowthBand?: number;
  vacancySpikeChance?: number;
  vacancySpikeRate?: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Run Monte Carlo on equity paths using perturbed growth rates. */
export function runMonteCarloEquity(
  runSimulation: (appreciationShift: number, rentShift: number, vacancy: number) => SimulationResult,
  sampleMonths: number[],
  options: MonteCarloOptions = {},
): MonteCarloBand[] {
  const runs = options.runs ?? 50;
  const appBand = options.appreciationBand ?? 0.01;
  const rentBand = options.rentGrowthBand ?? 0.01;
  const spikeChance = options.vacancySpikeChance ?? 0.15;
  const spikeRate = options.vacancySpikeRate ?? 0.1;

  const byMonth = new Map<number, number[]>();

  for (let i = 0; i < runs; i += 1) {
    const appShift = (Math.random() * 2 - 1) * appBand;
    const rentShift = (Math.random() * 2 - 1) * rentBand;
    const vacancy = Math.random() < spikeChance ? spikeRate : 0;
    const result = runSimulation(appShift, rentShift, vacancy);
    for (const month of sampleMonths) {
      const idx = Math.min(month, result.history.length) - 1;
      const equity = result.history[idx]?.totalEquity ?? 0;
      const arr = byMonth.get(month) ?? [];
      arr.push(equity);
      byMonth.set(month, arr);
    }
  }

  return sampleMonths.map((month) => {
    const vals = [...(byMonth.get(month) ?? [])].sort((a, b) => a - b);
    return {
      month,
      p10: percentile(vals, 0.1),
      p50: percentile(vals, 0.5),
      p90: percentile(vals, 0.9),
    };
  });
}
