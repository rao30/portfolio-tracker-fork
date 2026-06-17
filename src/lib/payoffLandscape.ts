import type { Portfolio } from './types';
import { compareStrategies, runSimulation, type StrategyId } from './snowball';
import type {
  LandscapeCell,
  LandscapeMetric,
  PayoffLandscapeGrid,
} from './payoffLandscapeTypes';

/** Stable key for memoization when portfolio simulation inputs change. */
export function portfolioSimulationSignature(portfolio: Portfolio): string {
  const settings = [
    portfolio.extraMonthlyBudget,
    portfolio.annualRentGrowthRate,
    portfolio.annualExpenseInflationRate,
    portfolio.reinvestSurplus,
    portfolio.monthlyReserveTarget,
    portfolio.defaultVacancyRate,
    portfolio.defaultCapexReserveRate,
    portfolio.defaultCapexReserveFlat,
  ].join(',');
  const props = portfolio.properties
    .map((p) =>
      [
        p.name,
        p.balance,
        p.monthlyPayment,
        p.monthlyRent,
        p.monthlyExpenses,
        p.monthlyUtilities ?? '',
        p.annualInterestRate,
        p.annualRentGrowthRate ?? '',
        p.annualExpenseInflationRate ?? '',
        p.vacancyRate ?? '',
        p.capexReserveRate ?? '',
        p.closeMonth ?? '',
      ].join(':'),
    )
    .join('|');
  return `${settings}|${props}`;
}

export const LANDSCAPE_STRATEGIES: StrategyId[] = [
  'highestRate',
  'highestPiPerDollar',
  'highestCashflowBoost',
  'lowestBalance',
  'lowestDscr',
  'highestInterestCost',
];

const MAX_BUDGET_ROWS = 15;

export function buildBudgetLevels(
  min: number,
  max: number,
  step: number,
  currentBudget?: number,
): number[] {
  const safeMin = Math.max(0, Math.min(min, max));
  const safeMax = Math.max(safeMin, max);
  const safeStep = Math.max(100, Math.min(5000, step));
  const levels: number[] = [];

  for (let b = safeMin; b <= safeMax && levels.length < MAX_BUDGET_ROWS; b += safeStep) {
    levels.push(Math.round(b));
  }

  if (currentBudget != null && Number.isFinite(currentBudget)) {
    const rounded = Math.round(currentBudget);
    if (!levels.includes(rounded)) {
      levels.push(rounded);
      levels.sort((a, b) => a - b);
    }
  }

  return levels.slice(0, MAX_BUDGET_ROWS);
}

function metricValue(cell: Omit<LandscapeCell, 'metricValue' | 'intensity' | 'isOptimal'>, metric: LandscapeMetric): number {
  if (metric === 'monthsToPayoff') return cell.monthsToPayoff;
  if (metric === 'totalInterest') return cell.totalInterest;
  return cell.interestSaved;
}

function computeIntensities(cells: LandscapeCell[], metric: LandscapeMetric): void {
  const values = cells.map((c) => c.metricValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  for (const cell of cells) {
    if (span <= 0) {
      cell.intensity = 0.5;
      continue;
    }
    const normalized = (cell.metricValue - min) / span;
    cell.intensity =
      metric === 'interestSaved' ? normalized : 1 - normalized;
  }
}

export function computePayoffLandscape(
  portfolio: Portfolio,
  options: {
    metric: LandscapeMetric;
    budgetMin: number;
    budgetMax: number;
    budgetStep: number;
    activeStrategy: StrategyId;
    activeBudget: number;
  },
): PayoffLandscapeGrid {
  const budgets = buildBudgetLevels(
    options.budgetMin,
    options.budgetMax,
    options.budgetStep,
    options.activeBudget,
  );

  const simOptions = {
    annualRentGrowthRate: portfolio.annualRentGrowthRate,
    annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
    reinvestSurplus: portfolio.reinvestSurplus,
    monthlyReserveTarget: portfolio.monthlyReserveTarget,
    defaultVacancyRate: portfolio.defaultVacancyRate,
    defaultCapexReserveRate: portfolio.defaultCapexReserveRate,
    defaultCapexReserveFlat: portfolio.defaultCapexReserveFlat,
  };

  const flatCells: LandscapeCell[] = [];

  for (const budget of budgets) {
    const comparisons = compareStrategies(portfolio.properties, {
      extraMonthlyBudget: budget,
      includeBaseline: true,
      simulationOptions: simOptions,
    });
    const baseline = comparisons.find((r) => r.strategy === 'baseline');

    for (const strategyId of LANDSCAPE_STRATEGIES) {
      const result = comparisons.find((r) => r.strategy === strategyId);
      if (!result) continue;

      const interestSaved = baseline
        ? baseline.totalInterestPaid - result.totalInterestPaid
        : 0;

      flatCells.push({
        strategyId,
        budget,
        monthsToPayoff: result.monthsToPayoff,
        totalInterest: result.totalInterestPaid,
        interestSaved,
        metricValue: 0,
        intensity: 0,
        isOptimal: false,
      });
    }
  }

  for (const cell of flatCells) {
    cell.metricValue = metricValue(cell, options.metric);
  }

  computeIntensities(flatCells, options.metric);

  let optimalCell: LandscapeCell | null = null;
  for (const cell of flatCells) {
    if (!optimalCell) {
      optimalCell = cell;
      continue;
    }
    const better =
      options.metric === 'interestSaved'
        ? cell.metricValue > optimalCell.metricValue ||
          (cell.metricValue === optimalCell.metricValue &&
            cell.monthsToPayoff < optimalCell.monthsToPayoff)
        : cell.metricValue < optimalCell.metricValue ||
          (cell.metricValue === optimalCell.metricValue &&
            cell.totalInterest < optimalCell.totalInterest);
    if (better) optimalCell = cell;
  }

  if (optimalCell) optimalCell.isOptimal = true;

  const activeCell =
    flatCells.find(
      (c) =>
        c.strategyId === options.activeStrategy &&
        c.budget === Math.round(options.activeBudget),
    ) ?? null;

  const cells: LandscapeCell[][] = budgets.map((budget) =>
    LANDSCAPE_STRATEGIES.map((strategyId) => {
      const cell = flatCells.find(
        (c) => c.budget === budget && c.strategyId === strategyId,
      );
      return cell!;
    }),
  );

  return {
    metric: options.metric,
    budgets,
    strategies: LANDSCAPE_STRATEGIES,
    cells,
    optimalCell,
    activeCell,
  };
}

/** Suggest budget range from portfolio P&I totals. */
export function defaultLandscapeRange(portfolio: Portfolio): {
  budgetMin: number;
  budgetMax: number;
  budgetStep: number;
} {
  const piSum = portfolio.properties.reduce((s, p) => s + p.monthlyPayment, 0);
  const current = portfolio.extraMonthlyBudget;
  const budgetMax = Math.max(
    5000,
    Math.ceil(Math.max(current * 2, piSum * 0.5) / 500) * 500,
  );
  return {
    budgetMin: 0,
    budgetMax,
    budgetStep: budgetMax <= 3000 ? 250 : 500,
  };
}

/** Quick sanity check: active strategy at current budget matches direct simulation. */
export function landscapeMatchesSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId,
  budget: number,
  monthsToPayoff: number,
): boolean {
  const result = runSimulation(
    { ...portfolio, extraMonthlyBudget: budget },
    strategyId,
    null,
  );
  return result.monthsToPayoff === monthsToPayoff;
}
