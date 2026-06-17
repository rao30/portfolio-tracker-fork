import type { Portfolio, Property, ScenarioConfig } from './types';
import {
  applyScenario,
  isPropertyActiveAtMonth,
  runSimulation,
  runSimulationWithPayoffOrder,
  type StrategyId,
} from './snowball';
import {
  balloonMonthForProperty,
  buildFinancingPreview,
  monthsUntilBalloon,
  resolveFinancingType,
} from './propertyFinancing';
import { formatCurrency, formatMonths } from './format';

export type BalloonSafetyStatus =
  | 'safe'
  | 'tight'
  | 'at_risk'
  | 'critical'
  | 'cleared'
  | 'conventional';

export interface PropertyBalloonSafety {
  propertyName: string;
  status: BalloonSafetyStatus;
  balloonMonth: number | null;
  payoffMonth: number | null;
  monthsUntilBalloon: number | null;
  safetyMarginMonths: number | null;
  balloonBalanceEstimate: number | null;
  refiPaymentEstimate: number | null;
  monthlyPayment: number;
  balance: number;
  actionLabel: string | null;
}

export interface BalloonSafetyAnalysis {
  properties: PropertyBalloonSafety[];
  sellerCount: number;
  atRiskCount: number;
  criticalCount: number;
  safeCount: number;
  verdict: string;
  verdictTone: 'positive' | 'caution' | 'neutral';
  minBudgetToClearWorst: number | null;
  worstPropertyName: string | null;
  timelineEndMonth: number;
}

function classifyStatus(
  payoffMonth: number | null,
  balloonMonth: number | null,
  monthsLeft: number | null,
): BalloonSafetyStatus {
  if (balloonMonth == null) return 'conventional';
  if (payoffMonth != null && payoffMonth <= balloonMonth) {
    const margin = balloonMonth - payoffMonth;
    if (margin >= 12) return 'safe';
    if (margin >= 3) return 'tight';
    return 'cleared';
  }
  if (monthsLeft != null && monthsLeft <= 12) return 'critical';
  return 'at_risk';
}

function actionForStatus(
  status: BalloonSafetyStatus,
  payoffMonth: number | null,
  balloonMonth: number | null,
  propertyName: string,
): string | null {
  switch (status) {
    case 'safe':
      return `Pays off ${formatMonths((balloonMonth ?? 0) - (payoffMonth ?? 0))} before balloon`;
    case 'tight':
      return 'Close call — consider prioritizing in playbook';
    case 'cleared':
      return 'Clears just before balloon — bump budget or reorder';
    case 'critical':
      return `Balloon imminent — prioritize ${propertyName.split('/')[0].trim()} now`;
    case 'at_risk':
      return 'Will refi at balloon unless you reorder or add budget';
    default:
      return null;
  }
}

function buildPropertySafety(
  p: Property,
  portfolio: Portfolio,
  payoffSchedule: Record<string, number>,
  asOfMonth: number,
): PropertyBalloonSafety | null {
  const financingType = resolveFinancingType(p);
  if (financingType !== 'seller') return null;
  if (!isPropertyActiveAtMonth(p, asOfMonth) || p.balance <= 0) return null;

  const balloonMonth = balloonMonthForProperty(p);
  const monthsLeft = monthsUntilBalloon(p, asOfMonth);
  const payoffMonth = payoffSchedule[p.name] ?? null;
  const preview = buildFinancingPreview(p, portfolio, asOfMonth);
  const status = classifyStatus(payoffMonth, balloonMonth, monthsLeft);
  const safetyMarginMonths =
    payoffMonth != null && balloonMonth != null ? balloonMonth - payoffMonth : null;

  return {
    propertyName: p.name,
    status,
    balloonMonth,
    payoffMonth,
    monthsUntilBalloon: monthsLeft,
    safetyMarginMonths,
    balloonBalanceEstimate: preview.balloonBalanceEstimate,
    refiPaymentEstimate: preview.refiPaymentEstimate,
    monthlyPayment: p.monthlyPayment,
    balance: p.balance,
    actionLabel: actionForStatus(status, payoffMonth, balloonMonth, p.name),
  };
}

export function buildBalloonSafetyAnalysis(
  portfolio: Portfolio,
  strategyId: StrategyId,
  payoffOrder: string[] | null = null,
  scenario: ScenarioConfig | null = null,
  asOfMonth = 1,
): BalloonSafetyAnalysis {
  const result =
    payoffOrder && payoffOrder.length > 0
      ? runSimulationWithPayoffOrder(portfolio, payoffOrder, scenario)
      : runSimulation(portfolio, strategyId, scenario);

  const { properties } = applyScenario(portfolio, scenario);
  const propertySafety = properties
    .map((p) => buildPropertySafety(p, portfolio, result.payoffSchedule, asOfMonth))
    .filter((row): row is PropertyBalloonSafety => row != null)
    .sort((a, b) => {
      const rank = (s: BalloonSafetyStatus) => {
        if (s === 'critical') return 0;
        if (s === 'at_risk') return 1;
        if (s === 'tight') return 2;
        if (s === 'cleared') return 3;
        if (s === 'safe') return 4;
        return 5;
      };
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return (a.monthsUntilBalloon ?? 999) - (b.monthsUntilBalloon ?? 999);
    });

  const atRiskCount = propertySafety.filter(
    (p) => p.status === 'at_risk' || p.status === 'critical',
  ).length;
  const criticalCount = propertySafety.filter((p) => p.status === 'critical').length;
  const safeCount = propertySafety.filter(
    (p) => p.status === 'safe' || p.status === 'tight',
  ).length;

  let verdict: string;
  let verdictTone: BalloonSafetyAnalysis['verdictTone'] = 'neutral';

  if (propertySafety.length === 0) {
    verdict = 'No seller-financed balloons in your active portfolio.';
  } else if (criticalCount > 0) {
    verdict = `${criticalCount} balloon${criticalCount > 1 ? 's' : ''} within 12 months — payoff order or budget must change now.`;
    verdictTone = 'caution';
  } else if (atRiskCount > 0) {
    verdict = `${atRiskCount} seller note${atRiskCount > 1 ? 's' : ''} will hit balloon before payoff — reorder playbook or add budget.`;
    verdictTone = 'caution';
  } else if (safeCount === propertySafety.length) {
    verdict = 'All seller balloons clear before payoff — your strategy is balloon-safe.';
    verdictTone = 'positive';
  } else {
    verdict = 'Mixed balloon safety — review tight margins before committing.';
    verdictTone = 'neutral';
  }

  const timelineEndMonth = Math.max(
    ...propertySafety.map((p) => Math.max(p.balloonMonth ?? 0, p.payoffMonth ?? 0)),
    asOfMonth + 60,
  );

  const worst = propertySafety.find(
    (p) => p.status === 'critical' || p.status === 'at_risk',
  );

  const minBudgetToClearWorst = worst
    ? solveMinBudgetForProperty(
        portfolio,
        worst.propertyName,
        strategyId,
        payoffOrder,
        scenario,
        asOfMonth,
      )
    : null;

  return {
    properties: propertySafety,
    sellerCount: propertySafety.length,
    atRiskCount,
    criticalCount,
    safeCount,
    verdict,
    verdictTone,
    minBudgetToClearWorst,
    worstPropertyName: worst?.propertyName ?? null,
    timelineEndMonth,
  };
}

export function solveMinBudgetForProperty(
  portfolio: Portfolio,
  propertyName: string,
  strategyId: StrategyId,
  payoffOrder: string[] | null,
  scenario: ScenarioConfig | null,
  asOfMonth: number,
  maxBudget = 50_000,
): number | null {
  const p = portfolio.properties.find((x) => x.name === propertyName);
  if (!p) return null;
  const balloonMonth = balloonMonthForProperty(p);
  if (balloonMonth == null) return null;

  const baseBudget = portfolio.extraMonthlyBudget;

  const paysBeforeBalloon = (budget: number): boolean => {
    const trial = { ...portfolio, extraMonthlyBudget: budget };
    const result =
      payoffOrder && payoffOrder.length > 0
        ? runSimulationWithPayoffOrder(trial, payoffOrder, scenario)
        : runSimulation(trial, strategyId, scenario);
    const payoff = result.payoffSchedule[propertyName];
    return payoff != null && payoff < balloonMonth;
  };

  if (paysBeforeBalloon(baseBudget)) return null;

  let lo = baseBudget;
  let hi = Math.max(baseBudget + 500, 500);

  while (hi <= maxBudget && !paysBeforeBalloon(hi)) {
    hi = Math.min(hi * 2, maxBudget);
    if (hi === maxBudget) break;
  }

  if (!paysBeforeBalloon(hi)) return null;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (paysBeforeBalloon(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const delta = lo - baseBudget;
  return delta > 0 ? delta : null;
}

export function reorderForBalloonSafety(
  portfolio: Portfolio,
  currentOrder: string[],
  analysis: BalloonSafetyAnalysis,
): string[] {
  const atRisk = analysis.properties
    .filter((p) => p.status === 'critical' || p.status === 'at_risk' || p.status === 'tight')
    .map((p) => p.propertyName);

  if (atRisk.length === 0) return currentOrder;

  const prioritized = [...atRisk];
  for (const name of currentOrder) {
    if (!prioritized.includes(name)) prioritized.push(name);
  }
  for (const p of portfolio.properties) {
    if (p.balance > 0 && !prioritized.includes(p.name)) {
      prioritized.push(p.name);
    }
  }
  return prioritized;
}

export function statusLabel(status: BalloonSafetyStatus): string {
  switch (status) {
    case 'safe':
      return 'Balloon-safe';
    case 'tight':
      return 'Tight margin';
    case 'cleared':
      return 'Just in time';
    case 'at_risk':
      return 'At risk';
    case 'critical':
      return 'Critical';
    default:
      return 'Conventional';
  }
}

export function formatSafetyMargin(months: number | null): string {
  if (months == null) return '—';
  if (months < 0) return `${formatMonths(Math.abs(months))} late`;
  if (months === 0) return 'Same month';
  return `${formatMonths(months)} early`;
}

export function budgetDeltaLabel(delta: number | null): string | null {
  if (delta == null) return null;
  return `+${formatCurrency(delta)}/mo`;
}
