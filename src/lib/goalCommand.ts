import type { Portfolio, SimulationResult } from './types';
import {
  findBudgetForDebtFreeByMonth,
  findBudgetForEquityAtMonth,
  runSimulation,
  runSimulationWithPayoffOrder,
  snapshotAtMonth,
  type StrategyId,
} from './snowball';
import {
  calendarToSimMonth,
  currentSimulationMonth,
  formatSimulationMonthLabel,
  simMonthToCalendar,
} from './format';
import type {
  GoalBudgetPreviewDelta,
  GoalCommandAnalysis,
  GoalCommandPreferences,
  GoalCommandTab,
  GoalStatusTone,
} from './goalCommandTypes';

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export const GOAL_PRESETS = [
  { id: '5yr', label: '5 years', months: 60 },
  { id: '10yr', label: '10 years', months: 120 },
  { id: '15yr', label: '15 years', months: 180 },
  { id: '20yr', label: '20 years', months: 240 },
] as const;

export function simMonthFromCalendarYear(
  year: number,
  portfolio: Portfolio,
): number {
  return calendarToSimMonth(
    year,
    portfolio.simulationAnchorMonth,
    portfolio.simulationAnchorYear,
    portfolio.simulationAnchorMonth,
  );
}

export function calendarYearFromSimMonth(
  simMonth: number,
  portfolio: Portfolio,
): number {
  return simMonthToCalendar(
    simMonth,
    portfolio.simulationAnchorYear,
    portfolio.simulationAnchorMonth,
  ).year;
}

export function defaultGoalPreferences(portfolio: Portfolio): GoalCommandPreferences {
  const debtFreeGoal = portfolio.goals.find((g) => g.type === 'debtFreeByMonth');
  const equityGoal = portfolio.goals.find((g) => g.type === 'equityAtMonth');

  return {
    isCollapsed: false,
    activeGoalType: 'debtFree',
    debtFreeTargetMonth: debtFreeGoal?.targetMonth ?? 180,
    equityTargetMonth: equityGoal?.targetMonth ?? 180,
    equityTargetValue: equityGoal?.targetValue ?? 2_000_000,
    lastExploredBudget: null,
    updatedAt: null,
  };
}

export function portfolioGoalsFromPreferences(
  prefs: Pick<
    GoalCommandPreferences,
    'debtFreeTargetMonth' | 'equityTargetMonth' | 'equityTargetValue'
  >,
): Portfolio['goals'] {
  return [
    { type: 'debtFreeByMonth', targetMonth: prefs.debtFreeTargetMonth },
    {
      type: 'equityAtMonth',
      targetMonth: prefs.equityTargetMonth,
      targetValue: prefs.equityTargetValue,
    },
  ];
}

function debtFreeLabel(simMonth: number, portfolio: Portfolio): string {
  return formatSimulationMonthLabel(
    simMonth,
    portfolio.simulationAnchorYear,
    portfolio.simulationAnchorMonth,
  );
}

function statusTone(isOnTrack: boolean, monthsDelta: number): GoalStatusTone {
  if (isOnTrack) return 'positive';
  if (monthsDelta <= 24) return 'caution';
  return 'neutral';
}

export function computeGoalCommandAnalysis(
  portfolio: Portfolio,
  active: SimulationResult,
  strategyId: StrategyId,
  prefs: GoalCommandPreferences,
  customOrder?: string[] | null,
): GoalCommandAnalysis {
  const currentMonth = currentSimulationMonth(
    portfolio.simulationAnchorYear,
    portfolio.simulationAnchorMonth,
  );
  const committedBudget = portfolio.extraMonthlyBudget;
  const activeTab = prefs.activeGoalType;
  const projectedPayoffMonth = active.monthsToPayoff;
  const projectedEquityAtHorizon = snapshotAtMonth(
    active,
    prefs.equityTargetMonth,
  )?.totalEquity ?? 0;

  if (activeTab === 'equity') {
    const isOnTrack = projectedEquityAtHorizon >= prefs.equityTargetValue;
    const equityGap = prefs.equityTargetValue - projectedEquityAtHorizon;
    const requiredBudget =
      !isOnTrack
        ? findBudgetForEquityAtMonth(
            portfolio,
            strategyId,
            prefs.equityTargetMonth,
            prefs.equityTargetValue,
          )
        : null;

    const statusHeadline = isOnTrack
      ? `On track for ${formatCurrencyShort(prefs.equityTargetValue)} equity`
      : `Need ${formatCurrencyShort(Math.max(0, equityGap))} more equity at horizon`;

    const statusDetail = isOnTrack
      ? `Projected ${formatCurrencyShort(projectedEquityAtHorizon)} by ${debtFreeLabel(prefs.equityTargetMonth, portfolio)} at ${formatCurrencyShort(committedBudget)}/mo.`
      : requiredBudget != null
        ? `Raise extra budget to ~${formatCurrencyShort(requiredBudget)}/mo to hit ${formatCurrencyShort(prefs.equityTargetValue)} by ${debtFreeLabel(prefs.equityTargetMonth, portfolio)}.`
        : `Target may be unreachable within model limits — review assumptions or extend the horizon.`;

    return {
      activeTab,
      statusTone: isOnTrack ? 'positive' : 'caution',
      statusHeadline,
      statusDetail,
      currentMonth,
      projectedPayoffMonth,
      debtFreeTargetMonth: prefs.debtFreeTargetMonth,
      equityTargetMonth: prefs.equityTargetMonth,
      equityTargetValue: prefs.equityTargetValue,
      projectedEquityAtHorizon,
      debtFreeLabel: debtFreeLabel(projectedPayoffMonth, portfolio),
      goalLabel: `${formatCurrencyShort(prefs.equityTargetValue)} by ${debtFreeLabel(prefs.equityTargetMonth, portfolio)}`,
      projectedLabel: formatCurrencyShort(projectedEquityAtHorizon),
      monthsToGoal: Math.max(0, prefs.equityTargetMonth - currentMonth),
      monthsDelta: 0,
      isOnTrack,
      requiredBudget,
      committedBudget,
      progressPercent: Math.min(
        100,
        (projectedEquityAtHorizon / Math.max(prefs.equityTargetValue, 1)) * 100,
      ),
    };
  }

  const monthsDelta = projectedPayoffMonth - prefs.debtFreeTargetMonth;
  const isOnTrack = monthsDelta <= 0;
  const requiredBudget =
    !isOnTrack
      ? findBudgetForDebtFreeByMonth(portfolio, strategyId, prefs.debtFreeTargetMonth)
      : null;

  const statusHeadline = isOnTrack
    ? `Free & clear by ${debtFreeLabel(prefs.debtFreeTargetMonth, portfolio)}`
    : `${Math.abs(monthsDelta)} months behind your freedom date`;

  const statusDetail = isOnTrack
    ? `Projected ${debtFreeLabel(projectedPayoffMonth, portfolio)} at ${formatCurrencyShort(committedBudget)}/mo — ${Math.abs(monthsDelta)} months ahead of goal.`
    : requiredBudget != null
      ? `Apply ~${formatCurrencyShort(requiredBudget)}/mo to reach ${debtFreeLabel(prefs.debtFreeTargetMonth, portfolio)} on schedule.`
      : `Target may be unreachable within model limits — review assumptions or extend the horizon.`;

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      ((prefs.debtFreeTargetMonth - projectedPayoffMonth) /
        Math.max(prefs.debtFreeTargetMonth - currentMonth, 1)) *
        100,
    ),
  );

  return {
    activeTab,
    statusTone: statusTone(isOnTrack, monthsDelta),
    statusHeadline,
    statusDetail,
    currentMonth,
    projectedPayoffMonth,
    debtFreeTargetMonth: prefs.debtFreeTargetMonth,
    equityTargetMonth: prefs.equityTargetMonth,
    equityTargetValue: prefs.equityTargetValue,
    projectedEquityAtHorizon,
    debtFreeLabel: debtFreeLabel(projectedPayoffMonth, portfolio),
    goalLabel: debtFreeLabel(prefs.debtFreeTargetMonth, portfolio),
    projectedLabel: debtFreeLabel(projectedPayoffMonth, portfolio),
    monthsToGoal: Math.max(0, prefs.debtFreeTargetMonth - currentMonth),
    monthsDelta,
    isOnTrack,
    requiredBudget,
    committedBudget,
    progressPercent,
  };
}

export function computeGoalBudgetPreview(
  portfolio: Portfolio,
  previewBudget: number,
  strategyId: StrategyId,
  _prefs: GoalCommandPreferences,
  customOrder?: string[] | null,
): SimulationResult {
  const draft: Portfolio = { ...portfolio, extraMonthlyBudget: previewBudget };
  if (customOrder && customOrder.length > 0) {
    return runSimulationWithPayoffOrder(draft, customOrder);
  }
  return runSimulation(draft, strategyId);
}

export function computeGoalBudgetPreviewDelta(
  portfolio: Portfolio,
  previewBudget: number,
  strategyId: StrategyId,
  prefs: GoalCommandPreferences,
  customOrder?: string[] | null,
): GoalBudgetPreviewDelta {
  const committedBudget = portfolio.extraMonthlyBudget;
  const committed = computeGoalBudgetPreview(
    portfolio,
    committedBudget,
    strategyId,
    prefs,
    customOrder,
  );
  const preview = computeGoalBudgetPreview(
    portfolio,
    previewBudget,
    strategyId,
    prefs,
    customOrder,
  );

  return {
    committedBudget,
    previewBudget,
    payoffMonthCommitted: committed.monthsToPayoff,
    payoffMonthPreview: preview.monthsToPayoff,
    debtFreeLabelCommitted: debtFreeLabel(committed.monthsToPayoff, portfolio),
    debtFreeLabelPreview: debtFreeLabel(preview.monthsToPayoff, portfolio),
    monthsDelta: preview.monthsToPayoff - committed.monthsToPayoff,
    equityAtHorizonCommitted:
      snapshotAtMonth(committed, prefs.equityTargetMonth)?.totalEquity ?? 0,
    equityAtHorizonPreview:
      snapshotAtMonth(preview, prefs.equityTargetMonth)?.totalEquity ?? 0,
  };
}

export function clampGoalTargetMonth(month: number): number {
  return Math.min(600, Math.max(12, Math.round(month)));
}

export function clampEquityTarget(value: number): number {
  return Math.min(1_000_000_000, Math.max(100_000, Math.round(value)));
}

export function setActiveGoalTab(
  prefs: GoalCommandPreferences,
  tab: GoalCommandTab,
): GoalCommandPreferences {
  return { ...prefs, activeGoalType: tab };
}
