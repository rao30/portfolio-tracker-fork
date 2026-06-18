import type { Portfolio, SimulationResult } from './types';
import {
  runSimulation,
  runSimulationWithPayoffOrder,
  type StrategyId,
} from './snowball';
import { formatMonths } from './format';
import type {
  PrincipalVelocityAnalysis,
  PrincipalVelocityPoint,
  PrincipalVelocityPreviewDelta,
  PrincipalVelocityVerdictTone,
  PropertyPrincipalShare,
} from './principalVelocityTypes';

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function runActiveSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder?: string[] | null,
): SimulationResult {
  if (customOrder && customOrder.length > 0) {
    return runSimulationWithPayoffOrder(portfolio, customOrder, null);
  }
  return runSimulation(portfolio, strategyId, null);
}

function runBaselineSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder?: string[] | null,
): SimulationResult {
  const draft: Portfolio = { ...portfolio, extraMonthlyBudget: 0 };
  return runActiveSimulation(draft, strategyId, customOrder);
}

function initialBalances(portfolio: Portfolio): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of portfolio.properties) {
    map[p.name] = p.balance;
  }
  return map;
}

function propertyPrincipalForMonth(
  result: SimulationResult,
  propertyName: string,
  month: number,
  startingBalances: Record<string, number>,
): number {
  const idx = month - 1;
  if (idx < 0 || idx >= result.history.length) return 0;
  const snap = result.history[idx];
  const prevBal =
    idx === 0
      ? (startingBalances[propertyName] ?? 0)
      : (result.history[idx - 1]?.balancesByName[propertyName] ?? 0);
  const currBal = snap.balancesByName[propertyName] ?? 0;
  return Math.max(0, prevBal - currBal);
}

function sumPrincipal(history: SimulationResult['history'], from: number, to: number): number {
  let total = 0;
  for (let m = from; m <= to; m += 1) {
    const snap = history[m - 1];
    if (snap) total += snap.totalPrincipalThisMonth;
  }
  return total;
}

export function buildPrincipalVelocitySeries(
  committed: SimulationResult,
  baseline: SimulationResult,
  horizonMonths: number,
): PrincipalVelocityPoint[] {
  const limit = Math.min(
    horizonMonths,
    committed.history.length,
    baseline.history.length,
  );
  const points: PrincipalVelocityPoint[] = [];
  let cumulative = 0;
  let baselineCumulative = 0;

  for (let month = 1; month <= limit; month += 1) {
    const snap = committed.history[month - 1];
    const baseSnap = baseline.history[month - 1];
    if (!snap || !baseSnap) break;

    const extraPrincipal = snap.totalExtraApplied;
    const totalPrincipal = snap.totalPrincipalThisMonth;
    const scheduledPrincipal = Math.max(0, totalPrincipal - extraPrincipal);
    cumulative += totalPrincipal;
    const baselinePrincipal = baseSnap.totalPrincipalThisMonth;
    baselineCumulative += baselinePrincipal;

    const prevEquity = month > 1 ? (committed.history[month - 2]?.totalEquity ?? 0) : 0;
    const equityDelta = snap.totalEquity - prevEquity;
    const appreciation = Math.max(0, equityDelta - totalPrincipal);
    const wealthVelocity = totalPrincipal + Math.max(0, snap.monthlyCashflow) + appreciation;

    points.push({
      month,
      scheduledPrincipal,
      extraPrincipal,
      totalPrincipal,
      cumulativePrincipal: cumulative,
      monthlyCashflow: snap.monthlyCashflow,
      appreciation,
      wealthVelocity,
      baselinePrincipal,
      baselineCumulative,
    });
  }

  return points;
}

export function buildPropertyPrincipalShares(
  portfolio: Portfolio,
  result: SimulationResult,
  asOfMonth: number,
): PropertyPrincipalShare[] {
  const starting = initialBalances(portfolio);
  const month = Math.min(asOfMonth, result.history.length);
  const yearStart = Math.max(1, month - 11);

  const shares = portfolio.properties.map((p) => {
    const principalThisMonth = propertyPrincipalForMonth(result, p.name, month, starting);
    let principalYearToDate = 0;
    for (let m = yearStart; m <= month; m += 1) {
      principalYearToDate += propertyPrincipalForMonth(result, p.name, m, starting);
    }
    return {
      propertyName: p.name,
      principalThisMonth,
      principalYearToDate,
      percentOfPortfolio: 0,
      payoffMonth: result.payoffSchedule[p.name] ?? null,
    };
  });

  const totalYtd = shares.reduce((s, row) => s + row.principalYearToDate, 0);
  return shares
    .map((row) => ({
      ...row,
      percentOfPortfolio: totalYtd > 0 ? (row.principalYearToDate / totalYtd) * 100 : 0,
    }))
    .sort((a, b) => b.principalYearToDate - a.principalYearToDate);
}

function verdictForAnalysis(
  acceleration: number,
  hiddenIncomeRatio: number,
  year1Principal: number,
  baselineYear1: number,
): { verdict: string; tone: PrincipalVelocityVerdictTone } {
  if (year1Principal <= baselineYear1 * 1.05) {
    return {
      verdict:
        'Principal velocity is near minimum-payment pace. Extra snowball budget would unlock a much larger hidden income stream.',
      tone: 'caution',
    };
  }

  if (acceleration >= 2 && hiddenIncomeRatio >= 0.5) {
    return {
      verdict: `Snowball is compounding — year-one principal paydown runs ${acceleration.toFixed(1)}× faster than minimum payments and rivals cashflow as wealth income.`,
      tone: 'positive',
    };
  }

  if (acceleration >= 1.4) {
    return {
      verdict: `Principal paydown is accelerating (${acceleration.toFixed(1)}× vs minimums). This forced equity is an under-appreciated monthly income stream lenders love to see.`,
      tone: 'positive',
    };
  }

  return {
    verdict: `Principal velocity is building — ${formatCurrencyShort(year1Principal)} in year one vs ${formatCurrencyShort(baselineYear1)} at minimum payments.`,
    tone: 'neutral',
  };
}

export function computePrincipalVelocityAnalysis(
  portfolio: Portfolio,
  strategyId: StrategyId,
  horizonMonths: number,
  customOrder?: string[] | null,
  extraBudget?: number,
): PrincipalVelocityAnalysis {
  const draft: Portfolio = {
    ...portfolio,
    extraMonthlyBudget: extraBudget ?? portfolio.extraMonthlyBudget,
  };
  const committed = runActiveSimulation(draft, strategyId, customOrder);
  const baseline = runBaselineSimulation(draft, strategyId, customOrder);
  const points = buildPrincipalVelocitySeries(committed, baseline, horizonMonths);

  const month12 = points[11];
  const year1TotalPrincipal = sumPrincipal(committed.history, 1, 12);
  const baselineYear1Principal = sumPrincipal(baseline.history, 1, 12);
  const accelerationFactorYear1 =
    baselineYear1Principal > 0 ? year1TotalPrincipal / baselineYear1Principal : 1;

  const year5Slice = points.slice(48, 60);
  const year5AverageMonthlyPrincipal =
    year5Slice.length > 0
      ? year5Slice.reduce((s, p) => s + p.totalPrincipal, 0) / year5Slice.length
      : 0;

  let peakPrincipalMonth = 1;
  let peakPrincipalAmount = 0;
  for (const p of points) {
    if (p.totalPrincipal > peakPrincipalAmount) {
      peakPrincipalAmount = p.totalPrincipal;
      peakPrincipalMonth = p.month;
    }
  }

  const currentMonthPrincipal = points[0]?.totalPrincipal ?? 0;
  const cashflowMonth12 = month12?.monthlyCashflow ?? 0;
  const hiddenIncomeRatio =
    cashflowMonth12 > 0 ? year1TotalPrincipal / 12 / cashflowMonth12 : year1TotalPrincipal > 0 ? 1 : 0;

  const propertyShares = buildPropertyPrincipalShares(portfolio, committed, 12);
  const { verdict, tone } = verdictForAnalysis(
    accelerationFactorYear1,
    hiddenIncomeRatio,
    year1TotalPrincipal,
    baselineYear1Principal,
  );

  return {
    points,
    currentMonthPrincipal,
    year1TotalPrincipal,
    year5AverageMonthlyPrincipal,
    baselineYear1Principal,
    accelerationFactorYear1,
    peakPrincipalMonth,
    peakPrincipalAmount,
    hiddenIncomeRatio,
    propertyShares,
    verdict,
    verdictTone: tone,
  };
}

export function computePrincipalVelocityPreviewDelta(
  portfolio: Portfolio,
  strategyId: StrategyId,
  committedBudget: number,
  previewBudget: number,
  horizonMonths: number,
  customOrder?: string[] | null,
): PrincipalVelocityPreviewDelta {
  const committed = computePrincipalVelocityAnalysis(
    portfolio,
    strategyId,
    horizonMonths,
    customOrder,
    committedBudget,
  );
  const preview = computePrincipalVelocityAnalysis(
    portfolio,
    strategyId,
    horizonMonths,
    customOrder,
    previewBudget,
  );

  return {
    year1PrincipalDelta: preview.year1TotalPrincipal - committed.year1TotalPrincipal,
    accelerationDelta: preview.accelerationFactorYear1 - committed.accelerationFactorYear1,
    peakPrincipalDelta: preview.peakPrincipalAmount - committed.peakPrincipalAmount,
    monthsToPeakDelta: preview.peakPrincipalMonth - committed.peakPrincipalMonth,
  };
}

export function formatPrincipalDelta(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatCurrencyShort(value)}`;
}

export function principalDeltaToneClass(value: number): string {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-amber-300';
  return 'text-slate-400';
}

export function peakMonthLabel(month: number): string {
  return formatMonths(month);
}
