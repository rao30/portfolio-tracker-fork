import type { Portfolio, SimulationResult } from './types';
import {
  compareStrategies,
  runSimulation,
  snapshotAtMonth,
  STRATEGIES,
  STRATEGY_LABELS,
  type StrategyId,
} from './snowball';
import { formatCurrency, formatMonths } from './format';

export interface StrategyLabRow {
  id: StrategyId;
  label: string;
  monthsToPayoff: number;
  totalInterestPaid: number;
  finalEquity: number;
  year10Equity: number;
  rank: number;
  deltaMonths: number;
  deltaInterest: number;
  deltaEquity: number;
  isActive: boolean;
  isBest: boolean;
}

export interface StrategyLabAnalysis {
  rows: StrategyLabRow[];
  activeId: StrategyId;
  bestId: StrategyId;
  headline: string;
  recommendation: string;
  previewResult: SimulationResult;
}

export interface StrategyLabScenario {
  id: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  isPinned: boolean;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const STRATEGY_IDS = Object.keys(STRATEGIES) as StrategyId[];

export function buildStrategyLabAnalysis(
  portfolio: Portfolio,
  activeStrategy: StrategyId,
  budgetOverride?: number,
): StrategyLabAnalysis {
  const budget = budgetOverride ?? portfolio.extraMonthlyBudget;
  const simOpts = {
    annualRentGrowthRate: portfolio.annualRentGrowthRate,
    annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
    reinvestSurplus: portfolio.reinvestSurplus,
    monthlyReserveTarget: portfolio.monthlyReserveTarget,
    defaultVacancyRate: portfolio.defaultVacancyRate,
    defaultCapexReserveRate: portfolio.defaultCapexReserveRate,
    defaultCapexReserveFlat: portfolio.defaultCapexReserveFlat,
  };

  const comparisons = compareStrategies(portfolio.properties, {
    extraMonthlyBudget: budget,
    includeBaseline: false,
    simulationOptions: simOpts,
  });

  const activeResult =
    comparisons.find((r) => r.strategy === activeStrategy) ??
    runSimulation({ ...portfolio, extraMonthlyBudget: budget }, activeStrategy);

  const sorted = [...comparisons].sort((a, b) => {
    if (a.monthsToPayoff !== b.monthsToPayoff) {
      return a.monthsToPayoff - b.monthsToPayoff;
    }
    return a.totalInterestPaid - b.totalInterestPaid;
  });

  const bestId = sorted[0]?.strategy as StrategyId;
  const bestResult = sorted[0];

  const rows: StrategyLabRow[] = STRATEGY_IDS.map((id) => {
    const result =
      comparisons.find((r) => r.strategy === id) ??
      runSimulation({ ...portfolio, extraMonthlyBudget: budget }, id);
    const rank = sorted.findIndex((r) => r.strategy === id) + 1;
    const year10 = snapshotAtMonth(result, 120)?.totalEquity ?? 0;
    const activeYear10 = snapshotAtMonth(activeResult, 120)?.totalEquity ?? 0;

    return {
      id,
      label: STRATEGY_LABELS[id],
      monthsToPayoff: result.monthsToPayoff,
      totalInterestPaid: result.totalInterestPaid,
      finalEquity: result.finalEquity,
      year10Equity: year10,
      rank,
      deltaMonths: result.monthsToPayoff - activeResult.monthsToPayoff,
      deltaInterest: result.totalInterestPaid - activeResult.totalInterestPaid,
      deltaEquity: year10 - activeYear10,
      isActive: id === activeStrategy,
      isBest: id === bestId,
    };
  }).sort((a, b) => a.rank - b.rank);

  const { headline, recommendation } = buildRecommendation(
    activeStrategy,
    bestId,
    activeResult,
    bestResult,
    budget,
  );

  return {
    rows,
    activeId: activeStrategy,
    bestId,
    headline,
    recommendation,
    previewResult: activeResult,
  };
}

function buildRecommendation(
  activeId: StrategyId,
  bestId: StrategyId,
  active: SimulationResult,
  best: SimulationResult | undefined,
  budget: number,
): { headline: string; recommendation: string } {
  if (!best || activeId === bestId) {
    return {
      headline: `${STRATEGY_LABELS[activeId]} is your fastest path`,
      recommendation:
        budget > 0
          ? `At ${formatCurrency(budget)}/mo extra, this strategy minimizes payoff time and interest for your portfolio.`
          : 'Add an extra monthly budget to accelerate payoff — use the slider to see how each strategy responds.',
    };
  }

  const monthsSaved = active.monthsToPayoff - best.monthsToPayoff;
  const interestSaved = active.totalInterestPaid - best.totalInterestPaid;

  const headline =
    monthsSaved > 0
      ? `Switch to ${STRATEGY_LABELS[bestId]} to finish ${formatMonths(monthsSaved)} sooner`
      : `Switch to ${STRATEGY_LABELS[bestId]} to save ${formatCurrency(Math.abs(interestSaved))} in interest`;

  const recommendation =
    monthsSaved > 0 && interestSaved > 0
      ? `${STRATEGY_LABELS[bestId]} beats your current ${STRATEGY_LABELS[activeId]} by ${formatMonths(monthsSaved)} and ${formatCurrency(interestSaved)} in lifetime interest.`
      : monthsSaved > 0
        ? `${STRATEGY_LABELS[bestId]} reaches debt-free ${formatMonths(monthsSaved)} faster than ${STRATEGY_LABELS[activeId]}.`
        : `${STRATEGY_LABELS[bestId]} costs ${formatCurrency(Math.abs(interestSaved))} less in interest over the life of your loans.`;

  return { headline, recommendation };
}

export function analyzePinnedScenario(
  portfolio: Portfolio,
  scenario: Pick<StrategyLabScenario, 'extraMonthlyBudget' | 'strategyId'>,
): StrategyLabAnalysis {
  return buildStrategyLabAnalysis(portfolio, scenario.strategyId, scenario.extraMonthlyBudget);
}

export function formatDeltaMonths(delta: number): string {
  if (delta === 0) return 'Same';
  const abs = formatMonths(Math.abs(delta));
  return delta < 0 ? `${abs} faster` : `${abs} slower`;
}

export function formatDeltaCurrency(delta: number): string {
  if (delta === 0) return '—';
  const abs = formatCurrency(Math.abs(delta));
  return delta < 0 ? `Save ${abs}` : `+${abs}`;
}
