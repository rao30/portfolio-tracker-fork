import type { Portfolio, Property, ScenarioConfig } from './types';
import {
  applyScenario,
  isPropertyActiveAtMonth,
  normalizePayoffOrder,
  runSimulation,
  runSimulationWithPayoffOrder,
  STRATEGIES,
  type StrategyId,
} from './snowball';
import { formatCurrency } from './format';

export interface PayoffRationaleTag {
  kind: 'balloon' | 'rate' | 'balance' | 'cashflow' | 'dscr' | 'interest';
  label: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface PlaybookStep {
  propertyName: string;
  rank: number;
  balance: number;
  annualRate: number;
  monthlyPayment: number;
  payoffMonth: number | null;
  cashflowFreed: number;
  rationale: PayoffRationaleTag[];
}

export interface BalloonAlert {
  propertyName: string;
  monthsUntilBalloon: number;
  balanceAtRisk: number;
  severity: 'critical' | 'warning';
}

export interface PayoffPlaybookState {
  propertyOrder: string[];
  baseStrategy: StrategyId | null;
  isActive: boolean;
  updatedAt: string | null;
}

function monthsUntilBalloon(p: Property, asOfMonth: number): number | null {
  if (p.financingType !== 'seller' && p.balloonMonths == null) return null;
  const closeMonth = p.closeMonth ?? 1;
  const balloonMonths = p.balloonMonths ?? 60;
  const balloonMonth = p.refiSimMonth ?? closeMonth + balloonMonths;
  if (asOfMonth >= balloonMonth) return null;
  return balloonMonth - asOfMonth;
}

function activeDebtProperties(properties: Property[], asOfMonth: number): Property[] {
  return properties.filter(
    (p) => isPropertyActiveAtMonth(p, asOfMonth) && p.balance > 0,
  );
}

function buildRationale(
  p: Property,
  rank: number,
  properties: Property[],
  asOfMonth: number,
): PayoffRationaleTag[] {
  const tags: PayoffRationaleTag[] = [];
  const active = activeDebtProperties(properties, asOfMonth);

  const balloon = monthsUntilBalloon(p, asOfMonth);
  if (balloon != null && balloon <= 24) {
    tags.push({
      kind: 'balloon',
      label:
        balloon <= 12
          ? `Balloon in ${balloon} mo`
          : `Balloon ~${Math.round(balloon / 12)} yr`,
      severity: balloon <= 12 ? 'critical' : 'warning',
    });
  }

  const rateRank = [...active]
    .sort((a, b) => b.annualInterestRate - a.annualInterestRate)
    .findIndex((x) => x.name === p.name);
  if (rateRank === 0 && active.length > 1) {
    tags.push({ kind: 'rate', label: 'Highest rate', severity: 'info' });
  }

  const balanceRank = [...active]
    .sort((a, b) => a.balance - b.balance)
    .findIndex((x) => x.name === p.name);
  if (balanceRank === 0 && active.length > 1) {
    tags.push({ kind: 'balance', label: 'Smallest balance', severity: 'info' });
  }

  const cfRank = [...active]
    .sort((a, b) => b.monthlyPayment - a.monthlyPayment)
    .findIndex((x) => x.name === p.name);
  if (cfRank === 0 && active.length > 1 && p.monthlyPayment >= 500) {
    tags.push({
      kind: 'cashflow',
      label: `Frees ${formatCurrency(p.monthlyPayment)}/mo`,
      severity: 'info',
    });
  }

  const dscr =
    p.monthlyPayment > 0
      ? (p.monthlyRent - p.monthlyExpenses) / p.monthlyPayment
      : Infinity;
  if (dscr < 1.25 && Number.isFinite(dscr)) {
    tags.push({
      kind: 'dscr',
      label: `DSCR ${dscr.toFixed(2)}`,
      severity: dscr < 1 ? 'critical' : 'warning',
    });
  }

  if (rank === 0 && tags.length === 0) {
    tags.push({ kind: 'interest', label: 'Attack next', severity: 'info' });
  }

  return tags;
}

export function computeBalloonAlerts(
  portfolio: Portfolio,
  asOfMonth = 1,
): BalloonAlert[] {
  const alerts: BalloonAlert[] = [];
  for (const p of portfolio.properties) {
    if (!isPropertyActiveAtMonth(p, asOfMonth) || p.balance <= 0) continue;
    const months = monthsUntilBalloon(p, asOfMonth);
    if (months == null || months > 36) continue;
    alerts.push({
      propertyName: p.name,
      monthsUntilBalloon: months,
      balanceAtRisk: p.balance,
      severity: months <= 12 ? 'critical' : 'warning',
    });
  }
  return alerts.sort((a, b) => a.monthsUntilBalloon - b.monthsUntilBalloon);
}

export function buildPlaybookSteps(
  portfolio: Portfolio,
  payoffOrder: string[],
  scenario: ScenarioConfig | null = null,
  asOfMonth = 1,
): PlaybookStep[] {
  const result = runSimulationWithPayoffOrder(portfolio, payoffOrder, scenario);
  const { properties } = applyScenario(portfolio, scenario);
  const normalized = result.order;

  return normalized
    .map((name, idx) => {
      const p = properties.find((x) => x.name === name);
      if (!p || !isPropertyActiveAtMonth(p, asOfMonth) || p.balance <= 0) {
        return null;
      }
      return {
        propertyName: name,
        rank: idx + 1,
        balance: p.balance,
        annualRate: p.annualInterestRate,
        monthlyPayment: p.monthlyPayment,
        payoffMonth: result.payoffSchedule[name] ?? null,
        cashflowFreed: p.monthlyPayment,
        rationale: buildRationale(p, idx, properties, asOfMonth),
      };
    })
    .filter((step): step is PlaybookStep => step != null);
}

export function orderFromStrategy(
  portfolio: Portfolio,
  strategyId: StrategyId,
  asOfMonth = 1,
): string[] {
  const active = activeDebtProperties(portfolio.properties, asOfMonth);
  return normalizePayoffOrder(
    portfolio,
    STRATEGIES[strategyId](active),
    asOfMonth,
  );
}

export function defaultPlaybookOrder(portfolio: Portfolio, asOfMonth = 1): string[] {
  return orderFromStrategy(portfolio, 'highestRate', asOfMonth);
}

export function comparePlaybookToStrategy(
  portfolio: Portfolio,
  payoffOrder: string[],
  strategyId: StrategyId,
  scenario: ScenarioConfig | null = null,
): { monthsDelta: number; interestDelta: number } {
  const custom = runSimulationWithPayoffOrder(portfolio, payoffOrder, scenario);
  const preset = runSimulation(portfolio, strategyId, scenario);
  return {
    monthsDelta: custom.monthsToPayoff - preset.monthsToPayoff,
    interestDelta: custom.totalInterestPaid - preset.totalInterestPaid,
  };
}

export function moveInOrder(order: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length ||
    fromIndex === toIndex
  ) {
    return order;
  }
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
