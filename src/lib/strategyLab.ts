import {
  runSimulation,
  STRATEGY_LABELS,
  type StrategyId,
} from './snowball';
import {
  formatCurrency,
  formatMonths,
  simMonthToCalendar,
} from './format';
import type { Portfolio, SimulationResult } from './types';

export const STRATEGY_LAB_MAX_SCENARIOS = 8;
export const STRATEGY_LAB_STORAGE_KEY = 'rental-snowball-strategy-lab';

export interface StrategyLabScenario {
  id: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  isPinned: boolean;
  notes?: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyLabMetrics {
  monthsToPayoff: number;
  debtFreeLabel: string;
  totalInterestPaid: number;
  interestSavedVsBaseline: number;
  monthsSavedVsBaseline: number;
  equityAtYear10: number;
  equityAtYear15: number;
  finalMonthlyCashflow: number;
  finalEquity: number;
}

export interface StrategyLabRow extends StrategyLabScenario {
  metrics: StrategyLabMetrics;
  isActive: boolean;
  balancePath: Array<{ month: number; balance: number }>;
}

export interface StrategyLabDbRow {
  id: string;
  user_id: string;
  name: string;
  extra_monthly_budget: number | string;
  strategy_id: string;
  is_pinned: boolean;
  notes: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

function portfolioWithBudget(portfolio: Portfolio, budget: number): Portfolio {
  return { ...portfolio, extraMonthlyBudget: budget };
}

export function computeScenarioMetrics(
  portfolio: Portfolio,
  strategyId: StrategyId,
  budget: number,
): { metrics: StrategyLabMetrics; result: SimulationResult; balancePath: StrategyLabRow['balancePath'] } {
  const scoped = portfolioWithBudget(portfolio, budget);
  const baseline = runSimulation(scoped, 'baseline');
  const result = runSimulation(scoped, strategyId);
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;

  const debtFreeCal = simMonthToCalendar(result.monthsToPayoff, anchorYear, anchorMonth);
  const debtFreeLabel = `${debtFreeCal.month}/${debtFreeCal.year}`;

  const year10Snap = result.history[Math.min(119, result.history.length - 1)];
  const year15Snap = result.history[Math.min(179, result.history.length - 1)];

  const balancePath = result.history
    .filter((_, i) => i % 3 === 0 || i === result.history.length - 1)
    .map((snap) => ({ month: snap.month, balance: snap.totalBalance }));

  return {
    result,
    balancePath,
    metrics: {
      monthsToPayoff: result.monthsToPayoff,
      debtFreeLabel,
      totalInterestPaid: result.totalInterestPaid,
      interestSavedVsBaseline: baseline.totalInterestPaid - result.totalInterestPaid,
      monthsSavedVsBaseline: baseline.monthsToPayoff - result.monthsToPayoff,
      equityAtYear10: year10Snap?.totalEquity ?? 0,
      equityAtYear15: year15Snap?.totalEquity ?? 0,
      finalMonthlyCashflow: result.finalMonthlyCashflow,
      finalEquity: result.finalEquity,
    },
  };
}

export function buildStrategyLabRows(
  portfolio: Portfolio,
  scenarios: StrategyLabScenario[],
  activeBudget: number,
  activeStrategyId: StrategyId,
): StrategyLabRow[] {
  return scenarios
    .filter((s) => s.isPinned)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((scenario) => {
      const { metrics, balancePath } = computeScenarioMetrics(
        portfolio,
        scenario.strategyId,
        scenario.extraMonthlyBudget,
      );
      return {
        ...scenario,
        metrics,
        balancePath,
        isActive:
          scenario.extraMonthlyBudget === activeBudget &&
          scenario.strategyId === activeStrategyId,
      };
    });
}

export function defaultScenarioName(
  budget: number,
  strategyId: StrategyId,
  existingNames: string[],
): string {
  const base = `${formatCurrency(budget)} · ${STRATEGY_LABELS[strategyId]}`;
  if (!existingNames.some((n) => n.toLowerCase() === base.toLowerCase())) return base;
  let i = 2;
  while (existingNames.some((n) => n.toLowerCase() === `${base} (${i})`.toLowerCase())) {
    i += 1;
  }
  return `${base} (${i})`;
}

export function scenarioMatchesActive(
  scenario: Pick<StrategyLabScenario, 'extraMonthlyBudget' | 'strategyId'>,
  budget: number,
  strategyId: StrategyId,
): boolean {
  return scenario.extraMonthlyBudget === budget && scenario.strategyId === strategyId;
}

export function formatDebtFreeHeadline(
  months: number,
  anchorYear: number,
  anchorMonth = 1,
): string {
  const cal = simMonthToCalendar(months, anchorYear, anchorMonth);
  return `Debt-free ${formatMonths(months)} · ${cal.month}/${cal.year}`;
}

export function dbRowToScenario(row: StrategyLabDbRow): StrategyLabScenario {
  return {
    id: row.id,
    name: row.name,
    extraMonthlyBudget: Number(row.extra_monthly_budget),
    strategyId: row.strategy_id as StrategyId,
    isPinned: row.is_pinned,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function scenarioToDbInsert(
  userId: string,
  scenario: Omit<StrategyLabScenario, 'id' | 'createdAt' | 'updatedAt'>,
): Record<string, unknown> {
  return {
    user_id: userId,
    name: scenario.name.trim(),
    extra_monthly_budget: scenario.extraMonthlyBudget,
    strategy_id: scenario.strategyId,
    is_pinned: scenario.isPinned,
    notes: scenario.notes ?? null,
    sort_order: scenario.sortOrder,
  };
}
