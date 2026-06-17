import type { Portfolio } from './types';
import {
  STRATEGIES,
  runSimulation,
  type StrategyId,
} from './snowball';
import type {
  PayoffLandscapeAnalysis,
  PayoffLandscapeCell,
  PayoffLandscapeMetric,
  PayoffLandscapeViewport,
} from './payoffLandscapeTypes';

const STRATEGY_IDS = Object.keys(STRATEGIES) as StrategyId[];

export function buildBudgetColumns(
  budgetMin: number,
  budgetMax: number,
  budgetStep: number,
): number[] {
  const min = Math.max(0, Math.round(budgetMin));
  const max = Math.max(min + budgetStep, Math.round(budgetMax));
  const step = Math.max(100, Math.round(budgetStep));
  const columns: number[] = [];
  for (let b = min; b <= max; b += step) {
    columns.push(b);
  }
  if (columns[columns.length - 1] !== max) {
    columns.push(max);
  }
  return [...new Set(columns)].sort((a, b) => a - b);
}

export function defaultLandscapeViewport(
  portfolio: Portfolio,
  budgetMax: number,
): PayoffLandscapeViewport {
  const current = portfolio.extraMonthlyBudget;
  const span = Math.max(2000, Math.min(budgetMax, Math.ceil(current * 2 / 500) * 500 + 1000));
  return {
    metric: 'monthsToPayoff',
    budgetMin: 0,
    budgetMax: Math.min(budgetMax, span),
    budgetStep: span <= 3000 ? 500 : 1000,
  };
}

function cellMetricValue(
  cell: Pick<PayoffLandscapeCell, 'monthsToPayoff' | 'totalInterest' | 'interestSaved'>,
  metric: PayoffLandscapeMetric,
): number {
  if (metric === 'monthsToPayoff') return cell.monthsToPayoff;
  if (metric === 'totalInterest') return cell.totalInterest;
  return cell.interestSaved;
}

export function computePayoffLandscape(
  portfolio: Portfolio,
  viewport: PayoffLandscapeViewport,
  activeStrategy: StrategyId,
): PayoffLandscapeAnalysis {
  const budgets = buildBudgetColumns(
    viewport.budgetMin,
    viewport.budgetMax,
    viewport.budgetStep,
  );

  const baselineInterest = runSimulation(
    { ...portfolio, extraMonthlyBudget: 0 },
    'highestRate',
    null,
  ).totalInterestPaid;

  const cells: PayoffLandscapeCell[] = [];

  for (const strategyId of STRATEGY_IDS) {
    for (const budget of budgets) {
      const result = runSimulation(
        { ...portfolio, extraMonthlyBudget: budget },
        strategyId,
        null,
      );
      cells.push({
        strategyId,
        budget,
        monthsToPayoff: result.monthsToPayoff,
        totalInterest: result.totalInterestPaid,
        interestSaved: Math.max(0, baselineInterest - result.totalInterestPaid),
        isOptimal: false,
        isCurrent:
          strategyId === activeStrategy && budget === portfolio.extraMonthlyBudget,
      });
    }
  }

  let optimal = cells[0];
  for (const cell of cells) {
    if (cell.monthsToPayoff < optimal.monthsToPayoff) {
      optimal = cell;
    } else if (
      cell.monthsToPayoff === optimal.monthsToPayoff &&
      cell.totalInterest < optimal.totalInterest
    ) {
      optimal = cell;
    }
  }

  for (const cell of cells) {
    cell.isOptimal =
      cell.strategyId === optimal.strategyId && cell.budget === optimal.budget;
  }

  const metricValues = cells.map((c) => cellMetricValue(c, viewport.metric));
  const metricMin = Math.min(...metricValues);
  const metricMax = Math.max(...metricValues);

  const currentCell =
    cells.find(
      (c) =>
        c.strategyId === activeStrategy &&
        c.budget === portfolio.extraMonthlyBudget,
    ) ?? null;

  return {
    cells,
    budgets,
    strategies: STRATEGY_IDS,
    viewport,
    optimal: {
      strategyId: optimal.strategyId,
      budget: optimal.budget,
      monthsToPayoff: optimal.monthsToPayoff,
    },
    metricMin,
    metricMax,
    currentCell,
  };
}

/** Lower metric value is better for months/interest; higher is better for interestSaved. */
export function landscapeCellScore(
  value: number,
  metric: PayoffLandscapeMetric,
  min: number,
  max: number,
): number {
  if (max === min) return 0.5;
  const t = (value - min) / (max - min);
  if (metric === 'interestSaved') return t;
  return 1 - t;
}

export function landscapeColor(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  const hue = Math.round(clamped * 120);
  return `hsl(${hue} 55% 28%)`;
}

export function formatLandscapeMetric(
  value: number,
  metric: PayoffLandscapeMetric,
): string {
  if (metric === 'monthsToPayoff') {
    const years = Math.floor(value / 12);
    const months = Math.round(value % 12);
    if (years === 0) return `${months}mo`;
    if (months === 0) return `${years}y`;
    return `${years}y ${months}mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
