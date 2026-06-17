import {
  runSimulation,
  STRATEGY_LABELS,
  type StrategyId,
} from './snowball';
import type { Portfolio, ScenarioConfig } from './types';
import { formatCurrency, formatMonths, simMonthToCalendar } from './format';

export const STRATEGY_LAB_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#fb923c',
] as const;

export const MAX_PINNED_SCENARIOS = 6;

export interface StrategyLabScenario {
  id: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  isPinned: boolean;
  notes: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyLabMetrics {
  monthsToPayoff: number;
  totalInterestPaid: number;
  finalEquity: number;
  year10Equity: number;
  debtFreeLabel: string;
  interestSavedVsBaseline: number;
  monthsSavedVsBaseline: number;
}

export interface StrategyLabRow extends StrategyLabScenario {
  metrics: StrategyLabMetrics;
  color: string;
  isLive?: boolean;
}

export function defaultScenarioName(
  strategyId: StrategyId,
  extraMonthlyBudget: number,
): string {
  const label = STRATEGY_LABELS[strategyId];
  return `${label} @ ${formatCurrency(extraMonthlyBudget)}/mo`;
}

export function computeStrategyLabMetrics(
  portfolio: Portfolio,
  strategyId: StrategyId,
  extraMonthlyBudget: number,
  scenario: ScenarioConfig,
  baseline: { monthsToPayoff: number; totalInterestPaid: number },
): StrategyLabMetrics {
  const testPortfolio = { ...portfolio, extraMonthlyBudget };
  const result = runSimulation(testPortfolio, strategyId, scenario);
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;
  const debtFree = simMonthToCalendar(
    result.monthsToPayoff,
    anchorYear,
    anchorMonth,
  );
  const debtFreeLabel = new Date(debtFree.year, debtFree.month - 1).toLocaleDateString(
    'en-US',
    { month: 'short', year: 'numeric' },
  );
  const year10Snap = result.history[Math.min(119, result.history.length - 1)];

  return {
    monthsToPayoff: result.monthsToPayoff,
    totalInterestPaid: result.totalInterestPaid,
    finalEquity: result.finalEquity,
    year10Equity: year10Snap?.totalEquity ?? 0,
    debtFreeLabel,
    interestSavedVsBaseline: baseline.totalInterestPaid - result.totalInterestPaid,
    monthsSavedVsBaseline: baseline.monthsToPayoff - result.monthsToPayoff,
  };
}

export function buildStrategyLabRows(
  portfolio: Portfolio,
  scenarios: StrategyLabScenario[],
  live: { strategyId: StrategyId; extraMonthlyBudget: number },
  scenario: ScenarioConfig,
): StrategyLabRow[] {
  const baseline = runSimulation(portfolio, 'baseline', scenario);
  const baselineRef = {
    monthsToPayoff: baseline.monthsToPayoff,
    totalInterestPaid: baseline.totalInterestPaid,
  };

  const pinned = scenarios
    .filter((s) => s.isPinned)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((s, index) => ({
      ...s,
      color: STRATEGY_LAB_COLORS[index % STRATEGY_LAB_COLORS.length],
      metrics: computeStrategyLabMetrics(
        portfolio,
        s.strategyId,
        s.extraMonthlyBudget,
        scenario,
        baselineRef,
      ),
    }));

  const liveMatchesPinned = pinned.some(
    (s) =>
      s.strategyId === live.strategyId &&
      s.extraMonthlyBudget === live.extraMonthlyBudget,
  );

  if (liveMatchesPinned) return pinned;

  const liveRow: StrategyLabRow = {
    id: '__live__',
    name: 'Live controls',
    extraMonthlyBudget: live.extraMonthlyBudget,
    strategyId: live.strategyId,
    isPinned: false,
    notes: null,
    sortOrder: -1,
    isLive: true,
    color: '#e2e8f0',
    metrics: computeStrategyLabMetrics(
      portfolio,
      live.strategyId,
      live.extraMonthlyBudget,
      scenario,
      baselineRef,
    ),
  };

  return [liveRow, ...pinned];
}

export function deltaTone(value: number, invert = false): string {
  const positive = invert ? value < 0 : value > 0;
  const negative = invert ? value > 0 : value < 0;
  if (positive) return 'text-emerald-400';
  if (negative) return 'text-amber-400';
  return 'text-slate-400';
}

export function formatDeltaMonths(months: number): string {
  if (months === 0) return '—';
  const sign = months > 0 ? '−' : '+';
  return `${sign}${formatMonths(Math.abs(months))}`;
}
