import type { Portfolio, SimulationResult } from './types';
import {
  STRATEGIES,
  STRATEGY_LABELS,
  runSimulation,
  runSimulationWithPayoffOrder,
  type StrategyId,
} from './snowball';
import { formatMonths, formatSimulationMonthLabel } from './format';
import type {
  BudgetSensitivityPoint,
  DecisionPulseAction,
  DecisionPulseAnalysis,
  StrategyDuel,
} from './decisionPulseTypes';

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function strategyResult(
  portfolio: Portfolio,
  strategyId: StrategyId,
  extraBudget?: number,
): SimulationResult {
  const draft: Portfolio = {
    ...portfolio,
    extraMonthlyBudget: extraBudget ?? portfolio.extraMonthlyBudget,
  };
  return runSimulation(draft, strategyId, null);
}

function getPayoffOrder(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder?: string[] | null,
): string[] {
  if (customOrder && customOrder.length > 0) return customOrder;
  return STRATEGIES[strategyId](portfolio.properties);
}

export function buildMonthlyAction(
  portfolio: Portfolio,
  result: SimulationResult,
  strategyId: StrategyId,
  customOrder?: string[] | null,
): DecisionPulseAction {
  const order = getPayoffOrder(portfolio, strategyId, customOrder);
  const targetName =
    order.find((name) => {
      const prop = portfolio.properties.find((p) => p.name === name);
      return prop && prop.balance > 0.01;
    }) ?? order[0];

  const property = portfolio.properties.find((p) => p.name === targetName);
  const payoffMonth = result.payoffSchedule[targetName] ?? result.monthsToPayoff;
  const rate = property?.annualInterestRate ?? 0;
  const balance = property?.balance ?? 0;
  const monthlyPayment = property?.monthlyPayment ?? 0;

  let rationale: string;
  if (customOrder && customOrder.length > 0) {
    rationale = `Next in your custom Payoff Playbook order.`;
  } else if (strategyId === 'highestRate') {
    rationale = `Highest rate (${formatPercent(rate)}) — avalanche minimizes total interest.`;
  } else if (strategyId === 'lowestBalance') {
    rationale = `Smallest balance (${formatCurrencyShort(balance)}) — snowball builds momentum with an early win.`;
  } else if (strategyId === 'highestCashflowBoost') {
    rationale = `Largest P&I (${formatCurrencyShort(monthlyPayment)}/mo) — frees the most cashflow when paid off.`;
  } else if (strategyId === 'lowestDscr') {
    rationale = `Weakest DSCR — strengthens portfolio coverage by retiring the riskiest loan first.`;
  } else if (strategyId === 'highestPiPerDollar') {
    rationale = `Highest P&I per dollar of balance — aggressive principal acceleration.`;
  } else if (strategyId === 'highestInterestCost') {
    rationale = `Highest total interest cost (balance × rate) — attacks the most expensive loan.`;
  } else {
    rationale = `Next property in the active payoff sequence.`;
  }

  return {
    propertyName: targetName,
    balance,
    annualRate: rate,
    monthlyPayment,
    payoffMonth,
    rationale,
  };
}

function formatPercent(rate: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}

export function buildStrategyDuel(
  comparisons: SimulationResult[],
  activeStrategy: StrategyId,
): StrategyDuel {
  const ranked = comparisons.filter((r) => r.strategy !== 'baseline');
  const winner = ranked[0];
  const runnerUp = ranked[1] ?? ranked[0];

  const winnerId = winner.strategy as StrategyId;
  const runnerUpId = runnerUp.strategy as StrategyId;
  const monthsSaved = runnerUp.monthsToPayoff - winner.monthsToPayoff;
  const interestSaved = runnerUp.totalInterestPaid - winner.totalInterestPaid;

  let verdict: string;
  if (winnerId === activeStrategy) {
    if (monthsSaved > 0 && interestSaved > 500) {
      verdict = `Your ${STRATEGY_LABELS[winnerId]} strategy is optimal — saves ${formatMonths(monthsSaved)} and ${formatCurrencyShort(interestSaved)} vs ${STRATEGY_LABELS[runnerUpId]}.`;
    } else if (monthsSaved > 0) {
      verdict = `Your ${STRATEGY_LABELS[winnerId]} strategy is fastest — ${formatMonths(monthsSaved)} sooner than ${STRATEGY_LABELS[runnerUpId]}.`;
    } else {
      verdict = `Your ${STRATEGY_LABELS[winnerId]} strategy ties for the fastest payoff at this budget.`;
    }
  } else if (monthsSaved > 0) {
    verdict = `Switch to ${STRATEGY_LABELS[winnerId]} to reach debt-free ${formatMonths(monthsSaved)} sooner and save ${formatCurrencyShort(interestSaved)} in interest.`;
  } else {
    verdict = `${STRATEGY_LABELS[winnerId]} and ${STRATEGY_LABELS[runnerUpId]} perform similarly at this budget.`;
  }

  return {
    winner: winnerId,
    winnerLabel: STRATEGY_LABELS[winnerId],
    runnerUp: runnerUpId,
    runnerUpLabel: STRATEGY_LABELS[runnerUpId],
    monthsSaved: Math.max(0, monthsSaved),
    interestSaved: Math.max(0, interestSaved),
    verdict,
  };
}

export function computeBudgetSensitivity(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder?: string[] | null,
): BudgetSensitivityPoint[] {
  const base = portfolio.extraMonthlyBudget;
  const offsets = [-500, 0, 500, 1000];
  const budgets = [...new Set(offsets.map((o) => Math.max(0, base + o)))].sort(
    (a, b) => a - b,
  );

  const results = budgets.map((budget) => {
    const result =
      customOrder && customOrder.length > 0
        ? runSimulationWithPayoffOrder(
            { ...portfolio, extraMonthlyBudget: budget },
            customOrder,
            null,
          )
        : strategyResult(portfolio, strategyId, budget);
    return { budget, result };
  });

  const baseline = results.find((r) => r.budget === base) ?? results[0];

  return results.map(({ budget, result }) => ({
    budget,
    monthsToPayoff: result.monthsToPayoff,
    totalInterest: result.totalInterestPaid,
    deltaMonths: result.monthsToPayoff - baseline.result.monthsToPayoff,
    deltaInterest: result.totalInterestPaid - baseline.result.totalInterestPaid,
  }));
}

export function buildDecisionPulse(
  portfolio: Portfolio,
  activeStrategy: StrategyId,
  activeResult: SimulationResult,
  comparisons: SimulationResult[],
  customOrder?: string[] | null,
): DecisionPulseAnalysis {
  const duel = buildStrategyDuel(comparisons, activeStrategy);
  const effectiveStrategy =
    customOrder && customOrder.length > 0 ? ('custom' as StrategyId) : activeStrategy;
  const action = buildMonthlyAction(
    portfolio,
    activeResult,
    effectiveStrategy,
    customOrder,
  );
  const sensitivity = computeBudgetSensitivity(
    portfolio,
    activeStrategy,
    customOrder,
  );

  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;
  const debtFreeLabel = formatSimulationMonthLabel(
    activeResult.monthsToPayoff,
    anchorYear,
    anchorMonth,
  );

  const activeVsBest =
    duel.winner !== activeStrategy && duel.monthsSaved > 0
      ? {
          monthsBehind: duel.monthsSaved,
          interestBehind: duel.interestSaved,
        }
      : null;

  let verdictTone: DecisionPulseAnalysis['verdictTone'] = 'neutral';
  if (activeVsBest) {
    verdictTone = duel.interestSaved > 10_000 ? 'caution' : 'neutral';
  } else if (portfolio.extraMonthlyBudget > 0) {
    verdictTone = 'positive';
  }

  const base = portfolio.extraMonthlyBudget;
  const budgetBump = sensitivity.find((p) => p.budget === base + 500);
  let verdict = duel.verdict;
  if (budgetBump && budgetBump.deltaMonths < -3 && portfolio.extraMonthlyBudget > 0) {
    verdict += ` Adding $500/mo moves debt-free ${formatMonths(Math.abs(budgetBump.deltaMonths))} earlier.`;
  }

  return {
    verdict,
    verdictTone,
    duel,
    action,
    sensitivity,
    debtFreeLabel,
    activeVsBest,
  };
}
