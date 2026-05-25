import { closeMonthFromYear } from './format';
import type {
  MonthSnapshot,
  Portfolio,
  Property,
  PropertyInsight,
  ScenarioConfig,
  SimulationResult,
} from './types';

const BALANCE_EPSILON = 0.01;
const DEFAULT_APPRECIATION = 0.03;
const DEFAULT_RENT_GROWTH = 0.025;
const DEFAULT_EXPENSE_INFLATION = 0.02;

export interface AmortizeResult {
  balance: number;
  interestPaid: number;
  principalPaid: number;
  extraApplied: number;
  paidOff: boolean;
}

export interface AmortizeInputs {
  balance: number;
  annualInterestRate: number;
  scheduledPayment: number;
  extraPayment: number;
  propertyName?: string;
}

export interface SimulationOptions {
  payoffOrder: string[];
  extraMonthlyBudget?: number;
  snowballCashflow?: boolean;
  maxMonths?: number;
  strategyName?: string;
  annualRentGrowthRate?: number;
  annualExpenseInflationRate?: number;
  reinvestSurplus?: boolean;
  monthlyReserveTarget?: number;
  vacancyRate?: number;
  capexReserveRate?: number;
  capexReserveFlat?: number;
  rateShock?: number;
  pauseExtraMonths?: number;
  /** Lump-sum extra principal applied in month 1 to the first active target. */
  initialLumpSum?: number;
  /** If true, return history even when balances remain after maxMonths. */
  allowUnresolved?: boolean;
}

interface SimState {
  name: string;
  balance: number;
  marketValue: number;
  monthlyRent: number;
  monthlyExpenses: number;
  monthlyPayment: number;
  annualInterestRate: number;
  rentGrowth: number;
  expenseInflation: number;
  appreciation: number;
  closeMonth: number;
  balloonMonths?: number;
  originalBalance: number;
  originalMarketValue: number;
  originalRent: number;
  originalExpenses: number;
}

function isPropertyOwned(state: SimState, month: number): boolean {
  return month >= state.closeMonth;
}

function monthsOnLoan(state: SimState, month: number): number {
  return month - state.closeMonth + 1;
}

function scheduledPaymentForMonth(state: SimState, month: number): number {
  if (!isPropertyOwned(state, month) || state.balance <= BALANCE_EPSILON) {
    return 0;
  }
  if (
    state.balloonMonths != null &&
    monthsOnLoan(state, month) > state.balloonMonths
  ) {
    return 0;
  }
  return state.monthlyPayment;
}

function isBalloonDue(state: SimState, month: number): boolean {
  return (
    state.balloonMonths != null &&
    isPropertyOwned(state, month) &&
    monthsOnLoan(state, month) === state.balloonMonths &&
    state.balance > BALANCE_EPSILON
  );
}

function allLoansResolved(states: SimState[], month: number): boolean {
  return states.every(
    (s) => isPropertyOwned(s, month) && s.balance <= BALANCE_EPSILON,
  );
}

function activateProperty(state: SimState): void {
  state.balance = state.originalBalance;
  state.marketValue = state.originalMarketValue;
  state.monthlyRent = state.originalRent;
  state.monthlyExpenses = state.originalExpenses;
}

function applyExtraToNames(
  states: SimState[],
  names: string[],
  amount: number,
): number {
  let remaining = amount;
  for (const name of names) {
    if (remaining <= 0) break;
    const target = states.find((s) => s.name === name);
    if (!target || target.balance <= BALANCE_EPSILON) continue;
    const before = target.balance;
    target.balance = applyExtraPrincipal(target.balance, remaining);
    remaining -= before - target.balance;
  }
  return amount - remaining;
}

/** Apply one month of scheduled P&I plus optional extra principal. */
export function amortizeOneMonth(inputs: AmortizeInputs): AmortizeResult {
  const { balance, annualInterestRate, scheduledPayment, extraPayment, propertyName } =
    inputs;

  if (balance < 0 || annualInterestRate < 0 || scheduledPayment < 0 || extraPayment < 0) {
    const label = propertyName ? ` (${propertyName})` : '';
    throw new Error(`Negative input not allowed${label}`);
  }

  if (balance <= BALANCE_EPSILON) {
    return {
      balance: 0,
      interestPaid: 0,
      principalPaid: 0,
      extraApplied: 0,
      paidOff: true,
    };
  }

  const monthlyRate = annualInterestRate / 12;
  const interest = balance * monthlyRate;

  if (scheduledPayment < interest - 1e-9) {
    const label = propertyName ? ` (${propertyName})` : '';
    throw new Error(
      `Scheduled payment does not cover interest${label}: payment ${scheduledPayment}, interest ${interest}`,
    );
  }

  const scheduledPrincipal = Math.min(scheduledPayment - interest, balance);
  const afterScheduled = balance - scheduledPrincipal;
  const extraApplied = Math.min(extraPayment, afterScheduled);
  const totalPrincipal = scheduledPrincipal + extraApplied;
  const newBalance = Math.max(0, balance - totalPrincipal);

  return {
    balance: newBalance,
    interestPaid: interest,
    principalPaid: totalPrincipal,
    extraApplied,
    paidOff: newBalance <= BALANCE_EPSILON,
  };
}

function applyExtraPrincipal(balance: number, extra: number): number {
  if (balance <= BALANCE_EPSILON || extra <= 0) return balance;
  return Math.max(0, balance - Math.min(extra, balance));
}

function monthlyGrowthFactor(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12);
}

function compoundGrowth(states: SimState[], month: number): void {
  for (const s of states) {
    if (!isPropertyOwned(s, month)) continue;
    s.marketValue *= monthlyGrowthFactor(s.appreciation);
    s.monthlyRent *= monthlyGrowthFactor(s.rentGrowth);
    s.monthlyExpenses *= monthlyGrowthFactor(s.expenseInflation);
  }
}

function initSimStates(
  properties: Property[],
  options: Pick<
    SimulationOptions,
    'annualRentGrowthRate' | 'annualExpenseInflationRate' | 'rateShock' | 'vacancyRate'
  >,
): SimState[] {
  const portfolioRentGrowth = options.annualRentGrowthRate ?? DEFAULT_RENT_GROWTH;
  const portfolioExpenseInflation =
    options.annualExpenseInflationRate ?? DEFAULT_EXPENSE_INFLATION;
  const vacancy = options.vacancyRate ?? 0;
  const rateShock = options.rateShock ?? 0;

  return properties.map((p) => {
    const closeMonth = p.closeMonth ?? 1;
    const activeAtStart = closeMonth <= 1;
    const originalRent = p.monthlyRent * (1 - vacancy);
    return {
      name: p.name,
      balance: activeAtStart ? p.balance : 0,
      marketValue: activeAtStart ? p.marketValue : 0,
      monthlyRent: activeAtStart ? originalRent : 0,
      monthlyExpenses: activeAtStart ? p.monthlyExpenses : 0,
      monthlyPayment: p.monthlyPayment,
      annualInterestRate: p.annualInterestRate + rateShock,
      rentGrowth: p.annualRentGrowthRate ?? portfolioRentGrowth,
      expenseInflation: p.annualExpenseInflationRate ?? portfolioExpenseInflation,
      appreciation: p.annualAppreciationRate,
      closeMonth,
      balloonMonths: p.balloonMonths,
      originalBalance: p.balance,
      originalMarketValue: p.marketValue,
      originalRent,
      originalExpenses: p.monthlyExpenses,
    };
  });
}

function computeMonthlyCashflow(states: SimState[], month: number): number {
  return states.reduce((sum, s) => {
    if (!isPropertyOwned(s, month)) return sum;
    const netRent = s.monthlyRent - s.monthlyExpenses;
    if (s.balance <= BALANCE_EPSILON) return sum + netRent;
    const pi = scheduledPaymentForMonth(s, month);
    return sum + (netRent - pi);
  }, 0);
}

function computeMonthlyPi(states: SimState[], month: number): number {
  return states.reduce((sum, s) => {
    if (!isPropertyOwned(s, month) || s.balance <= BALANCE_EPSILON) return sum;
    return sum + scheduledPaymentForMonth(s, month);
  }, 0);
}

function computeCapexDeduction(
  states: SimState[],
  capexRate: number,
  capexFlat: number,
): number {
  const rentTotal = states.reduce((s, p) => s + p.monthlyRent, 0);
  return rentTotal * capexRate + capexFlat;
}

function buildEquitySnapshot(
  states: SimState[],
  cashReserve: number,
  month: number,
  monthInterest: number,
  monthPrincipal: number,
  monthExtra: number,
  monthlyCashflow: number,
  target: string | null,
  paidOffThisMonth: string[],
  balloonDueThisMonth: string[],
  cumulativeRent: number,
  cumulativeExpenses: number,
  cumulativeCashflow: number,
): MonthSnapshot {
  const balancesByName: Record<string, number> = {};
  const valuesByName: Record<string, number> = {};
  const equityByName: Record<string, number> = {};
  let totalBalance = 0;
  let totalPropertyValue = 0;

  for (const s of states) {
    balancesByName[s.name] = s.balance;
    valuesByName[s.name] = s.marketValue;
    equityByName[s.name] = s.marketValue - s.balance;
    totalBalance += s.balance;
    totalPropertyValue += s.marketValue;
  }

  const totalEquity = totalPropertyValue - totalBalance;

  return {
    month,
    totalBalance,
    totalInterestThisMonth: monthInterest,
    totalPrincipalThisMonth: monthPrincipal,
    totalExtraApplied: monthExtra,
    monthlyCashflow,
    targetProperty: target,
    paidOffThisMonth,
    balloonDueThisMonth,
    balancesByName,
    valuesByName,
    equityByName,
    totalEquity,
    totalPropertyValue,
    totalLiabilities: totalBalance,
    netWorth: totalEquity + cashReserve,
    monthlyRent: states.reduce(
      (sum, p) => sum + (isPropertyOwned(p, month) ? p.monthlyRent : 0),
      0,
    ),
    monthlyExpenses: states.reduce(
      (sum, p) => sum + (isPropertyOwned(p, month) ? p.monthlyExpenses : 0),
      0,
    ),
    monthlyPi: computeMonthlyPi(states, month),
    cumulativeRentCollected: cumulativeRent,
    cumulativeExpenses: cumulativeExpenses,
    cashReserveBalance: cashReserve,
    cumulativeCashflowGenerated: cumulativeCashflow,
  };
}

export type StrategyFn = (properties: Property[]) => string[];

export const STRATEGIES = {
  highestRate: (properties: Property[]) =>
    [...properties]
      .sort((a, b) => b.annualInterestRate - a.annualInterestRate)
      .map((p) => p.name),
  highestPiPerDollar: (properties: Property[]) =>
    [...properties]
      .sort(
        (a, b) =>
          b.monthlyPayment / b.balance - a.monthlyPayment / a.balance,
      )
      .map((p) => p.name),
  highestCashflowBoost: (properties: Property[]) =>
    [...properties]
      .sort((a, b) => b.monthlyPayment - a.monthlyPayment)
      .map((p) => p.name),
  lowestBalance: (properties: Property[]) =>
    [...properties]
      .sort((a, b) => a.balance - b.balance)
      .map((p) => p.name),
} as const satisfies Record<string, StrategyFn>;

export const STRATEGY_LABELS: Record<keyof typeof STRATEGIES, string> = {
  highestRate: 'Highest Rate (Avalanche)',
  highestPiPerDollar: 'Highest P&I per $ Balance',
  highestCashflowBoost: 'Highest Cashflow Boost',
  lowestBalance: 'Lowest Balance (Snowball)',
};

export type StrategyId = keyof typeof STRATEGIES;

function validatePayoffOrder(payoffOrder: string[], propertyNames: Set<string>): void {
  const seen = new Set<string>();
  for (const name of payoffOrder) {
    if (!propertyNames.has(name)) {
      throw new Error(`Unknown property in payoff order: ${name}`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate property in payoff order: ${name}`);
    }
    seen.add(name);
  }
}

function findTarget(
  payoffOrder: string[],
  states: SimState[],
  month: number,
): string | null {
  return (
    payoffOrder.find((name) => {
      const s = states.find((p) => p.name === name);
      return (
        s &&
        isPropertyOwned(s, month) &&
        s.balance > BALANCE_EPSILON
      );
    }) ?? null
  );
}

function applyExtraToTarget(
  states: SimState[],
  targetName: string | null,
  amount: number,
): number {
  if (!targetName || amount <= 0) return 0;
  const target = states.find((s) => s.name === targetName);
  if (!target || target.balance <= BALANCE_EPSILON) return 0;
  const before = target.balance;
  target.balance = applyExtraPrincipal(target.balance, amount);
  return before - target.balance;
}

/**
 * Simulate aggressive snowball payoff until all loans are zero.
 * Does not mutate the input properties array.
 */
export function simulateSnowball(
  properties: Property[],
  options: SimulationOptions,
): SimulationResult {
  const extraMonthlyBudget = options.extraMonthlyBudget ?? 0;
  const snowballCashflow = options.snowballCashflow ?? true;
  const maxMonths = options.maxMonths ?? 600;
  const strategyName = options.strategyName ?? 'custom';
  const reinvestSurplus = options.reinvestSurplus ?? false;
  const monthlyReserveTarget = options.monthlyReserveTarget ?? 0;
  const capexRate = options.capexReserveRate ?? 0;
  const capexFlat = options.capexReserveFlat ?? 0;
  const pauseExtraMonths = options.pauseExtraMonths ?? 0;
  let initialLumpSum = options.initialLumpSum ?? 0;

  if (extraMonthlyBudget < 0) {
    throw new Error('extraMonthlyBudget must be non-negative');
  }

  const states = initSimStates(properties, options);
  const propertyNames = new Set(states.map((p) => p.name));
  validatePayoffOrder(options.payoffOrder, propertyNames);

  const history: MonthSnapshot[] = [];
  const payoffSchedule: Record<string, number> = {};
  const balloonPayoffSchedule: Record<string, number> = {};
  let totalInterestPaid = 0;
  let totalExtraPaid = 0;
  let cashReserve = 0;
  let cumulativeRent = 0;
  let cumulativeExpenses = 0;
  let cumulativeCashflow = 0;

  for (let month = 1; month <= maxMonths; month += 1) {
    if (month > 1) {
      compoundGrowth(states, month);
    }

    for (const s of states) {
      if (month === s.closeMonth && s.closeMonth > 1) {
        activateProperty(s);
      }
    }

    if (allLoansResolved(states, month)) break;

    const effectiveBudget = month <= pauseExtraMonths ? 0 : extraMonthlyBudget;
    let extraPool = effectiveBudget;

    if (snowballCashflow) {
      for (const s of states) {
        if (!isPropertyOwned(s, month)) continue;
        if (s.balance <= BALANCE_EPSILON) {
          extraPool += s.monthlyPayment;
        }
      }
    }

    if (month === 1 && initialLumpSum > 0) {
      extraPool += initialLumpSum;
      initialLumpSum = 0;
    }

    const target = findTarget(options.payoffOrder, states, month);
    const balloonDueNames = states
      .filter((s) => isBalloonDue(s, month))
      .map((s) => s.name);
    const balloonPriority = options.payoffOrder.filter((n) =>
      balloonDueNames.includes(n),
    );

    let monthInterest = 0;
    let monthPrincipal = 0;
    let monthExtra = 0;
    const paidOffThisMonth: string[] = [];

    for (const s of states) {
      const startBal = s.balance;
      if (!isPropertyOwned(s, month) || startBal <= BALANCE_EPSILON) continue;

      const payment = scheduledPaymentForMonth(s, month);
      const result = amortizeOneMonth({
        balance: startBal,
        annualInterestRate: s.annualInterestRate,
        scheduledPayment: payment,
        extraPayment: 0,
        propertyName: s.name,
      });

      s.balance = result.balance;
      monthInterest += result.interestPaid;
      monthPrincipal += result.principalPaid;

      if (result.paidOff && startBal > BALANCE_EPSILON) {
        paidOffThisMonth.push(s.name);
        if (!(s.name in payoffSchedule)) {
          payoffSchedule[s.name] = month;
        }
      }
    }

    if (balloonPriority.length > 0 && extraPool > 0) {
      const applied = applyExtraToNames(states, balloonPriority, extraPool);
      monthExtra += applied;
      monthPrincipal += applied;
      extraPool -= applied;

      for (const name of balloonPriority) {
        const s = states.find((p) => p.name === name);
        if (s && s.balance <= BALANCE_EPSILON && !(name in balloonPayoffSchedule)) {
          balloonPayoffSchedule[name] = month;
        }
      }
    }

    if (target && extraPool > 0) {
      const applied = applyExtraToNames(states, [target], extraPool);
      monthExtra += applied;
      monthPrincipal += applied;
      extraPool = 0;
    }

    for (const s of states) {
      if (
        s.balance <= BALANCE_EPSILON &&
        isPropertyOwned(s, month) &&
        !paidOffThisMonth.includes(s.name)
      ) {
        paidOffThisMonth.push(s.name);
        if (!(s.name in payoffSchedule)) {
          payoffSchedule[s.name] = month;
        }
      }
    }

    cumulativeRent += states.reduce(
      (sum, st) => sum + (isPropertyOwned(st, month) ? st.monthlyRent : 0),
      0,
    );
    cumulativeExpenses += states.reduce(
      (sum, st) => sum + (isPropertyOwned(st, month) ? st.monthlyExpenses : 0),
      0,
    );

    let monthlyCashflow = computeMonthlyCashflow(states, month);
    const capexDeduction = computeCapexDeduction(states, capexRate, capexFlat);
    monthlyCashflow -= capexDeduction;

    if (monthlyCashflow > 0) {
      cumulativeCashflow += monthlyCashflow;
    }

    const surplus = monthlyCashflow - monthlyReserveTarget;
    if (surplus > 0) {
      if (reinvestSurplus) {
        const balancesBeforeReinvest = new Map(states.map((s) => [s.name, s.balance]));
        const currentTarget = findTarget(options.payoffOrder, states, month);
        const surplusReinvested = applyExtraToTarget(states, currentTarget, surplus);
        monthExtra += surplusReinvested;
        monthPrincipal += surplusReinvested;
        totalExtraPaid += surplusReinvested;

        for (const s of states) {
          const before = balancesBeforeReinvest.get(s.name) ?? 0;
          if (before > BALANCE_EPSILON && s.balance <= BALANCE_EPSILON) {
            if (!paidOffThisMonth.includes(s.name)) {
              paidOffThisMonth.push(s.name);
            }
            if (!(s.name in payoffSchedule)) {
              payoffSchedule[s.name] = month;
            }
          }
        }
      } else {
        cashReserve += surplus;
      }
    }

    totalInterestPaid += monthInterest;
    totalExtraPaid += monthExtra;

    history.push(
      buildEquitySnapshot(
        states,
        cashReserve,
        month,
        monthInterest,
        monthPrincipal,
        monthExtra,
        monthlyCashflow,
        target,
        paidOffThisMonth,
        balloonDueNames,
        cumulativeRent,
        cumulativeExpenses,
        cumulativeCashflow,
      ),
    );

    if (allLoansResolved(states, month)) break;
  }

  const lastSimMonth = history[history.length - 1]?.month ?? 0;
  const remaining = states.some(
    (s) => s.closeMonth <= lastSimMonth && s.balance > BALANCE_EPSILON,
  );
  if (remaining && !options.allowUnresolved) {
    throw new Error(
      `Simulation did not converge within ${maxMonths} months`,
    );
  }

  const lastState = states;
  const finalMonthlyCashflow = lastState.reduce(
    (sum, s) => sum + (s.monthlyRent - s.monthlyExpenses),
    0,
  );
  const finalEquity = lastState.reduce(
    (sum, s) => sum + (s.marketValue - s.balance),
    0,
  );
  const lastSnapshot = history[history.length - 1];

  return {
    strategy: strategyName,
    order: options.payoffOrder,
    monthsToPayoff: history.length,
    totalInterestPaid,
    totalExtraPaid,
    finalMonthlyCashflow,
    payoffSchedule,
    balloonPayoffSchedule,
    history,
    finalEquity,
    finalNetWorth: lastSnapshot?.netWorth ?? finalEquity,
  };
}

function portfolioSimOptions(
  portfolio: Portfolio,
  scenario?: ScenarioConfig | null,
): Omit<SimulationOptions, 'payoffOrder' | 'strategyName'> {
  const base = {
    extraMonthlyBudget: portfolio.extraMonthlyBudget,
    annualRentGrowthRate: portfolio.annualRentGrowthRate,
    annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
    reinvestSurplus: portfolio.reinvestSurplus,
    monthlyReserveTarget: portfolio.monthlyReserveTarget,
  };

  if (!scenario || scenario.id === 'base') return base;

  return {
    ...base,
    vacancyRate: scenario.vacancyRate,
    capexReserveRate: scenario.capexReserveRate,
    capexReserveFlat: scenario.capexReserveFlat,
    rateShock: scenario.rateShock,
    pauseExtraMonths: scenario.pauseExtraMonths,
  };
}

/** Apply a scenario: returns properties to simulate and optional lump-sum from sale. */
export function applyScenario(
  portfolio: Portfolio,
  scenario: ScenarioConfig | null,
): { properties: Property[]; initialLumpSum: number } {
  if (!scenario || scenario.id === 'base' || !scenario.sellProperty) {
    return { properties: portfolio.properties, initialLumpSum: 0 };
  }

  const sold = portfolio.properties.find((p) => p.name === scenario.sellProperty);
  if (!sold) {
    return { properties: portfolio.properties, initialLumpSum: 0 };
  }

  const closingRate = scenario.sellClosingCostRate ?? 0.06;
  const proceeds = sold.marketValue * (1 - closingRate) - sold.balance;
  const remaining = portfolio.properties.filter((p) => p.name !== scenario.sellProperty);

  return {
    properties: remaining,
    initialLumpSum: Math.max(0, proceeds),
  };
}

export const SCENARIO_PRESETS: ScenarioConfig[] = [
  { id: 'base', label: 'Base case' },
  { id: 'vacancy10', label: '10% vacancy', vacancyRate: 0.1 },
  { id: 'vacancy15', label: '15% vacancy', vacancyRate: 0.15 },
  { id: 'capex5', label: '5% capex reserve', capexReserveRate: 0.05 },
  { id: 'rateShock1', label: '+1% rate shock', rateShock: 0.01 },
  { id: 'rateShock2', label: '+2% rate shock', rateShock: 0.02 },
  { id: 'pauseExtra12', label: 'Pause extra 12 mo', pauseExtraMonths: 12 },
  { id: 'pauseExtra24', label: 'Pause extra 24 mo', pauseExtraMonths: 24 },
];

export function buildSellScenario(propertyName: string): ScenarioConfig {
  return {
    id: `sell-${propertyName}`,
    label: `Sell ${propertyName}`,
    sellProperty: propertyName,
  };
}

/** Run all registered strategies (and optional baseline) and sort by speed. */
export function compareStrategies(
  properties: Property[],
  options?: {
    extraMonthlyBudget?: number;
    includeBaseline?: boolean;
    simulationOptions?: Omit<SimulationOptions, 'payoffOrder' | 'strategyName' | 'extraMonthlyBudget'>;
  },
): SimulationResult[] {
  const extraMonthlyBudget = options?.extraMonthlyBudget ?? 0;
  const includeBaseline = options?.includeBaseline ?? true;
  const simOpts = options?.simulationOptions ?? {};

  const results: SimulationResult[] = [];

  for (const [id, fn] of Object.entries(STRATEGIES)) {
    const payoffOrder = fn(properties);
    results.push(
      simulateSnowball(properties, {
        payoffOrder,
        extraMonthlyBudget,
        snowballCashflow: true,
        strategyName: id,
        ...simOpts,
      }),
    );
  }

  if (includeBaseline) {
    results.push(
      simulateSnowball(properties, {
        payoffOrder: properties.map((p) => p.name),
        extraMonthlyBudget: 0,
        snowballCashflow: false,
        strategyName: 'baseline',
        ...simOpts,
      }),
    );
  }

  results.sort((a, b) => {
    if (a.monthsToPayoff !== b.monthsToPayoff) {
      return a.monthsToPayoff - b.monthsToPayoff;
    }
    return a.totalInterestPaid - b.totalInterestPaid;
  });

  return results;
}

export function runSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId | 'baseline',
  scenario: ScenarioConfig | null = null,
): SimulationResult {
  const { properties, initialLumpSum } = applyScenario(portfolio, scenario);
  const simOpts = portfolioSimOptions(portfolio, scenario);

  if (strategyId === 'baseline') {
    return simulateSnowball(properties, {
      payoffOrder: properties.map((p) => p.name),
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'baseline',
      initialLumpSum,
      ...simOpts,
    });
  }

  return simulateSnowball(properties, {
    payoffOrder: STRATEGIES[strategyId](properties),
    extraMonthlyBudget: portfolio.extraMonthlyBudget,
    snowballCashflow: true,
    strategyName: strategyId,
    initialLumpSum,
    ...simOpts,
  });
}

/** Snapshot at a given month (clamped to history). */
export function snapshotAtMonth(
  result: SimulationResult,
  month: number,
): MonthSnapshot | null {
  if (result.history.length === 0) return null;
  const idx = Math.min(Math.max(month, 1), result.history.length) - 1;
  return result.history[idx] ?? null;
}

/** Current portfolio equity from property inputs (month 0). */
export function currentPortfolioMetrics(properties: Property[]): {
  totalEquity: number;
  totalValue: number;
  totalLiabilities: number;
  ltv: number;
} {
  const totalValue = properties.reduce((s, p) => s + p.marketValue, 0);
  const totalLiabilities = properties.reduce((s, p) => s + p.balance, 0);
  const totalEquity = totalValue - totalLiabilities;
  const ltv = totalValue > 0 ? totalLiabilities / totalValue : 0;
  return { totalEquity, totalValue, totalLiabilities, ltv };
}

export function computePropertyInsights(
  properties: Property[],
  payoffOrder: string[],
): PropertyInsight[] {
  return properties.map((p) => {
    const equity = p.marketValue - p.balance;
    const ltv = p.marketValue > 0 ? p.balance / p.marketValue : 0;
    const netRent = p.monthlyRent - p.monthlyExpenses;
    const capRate = p.marketValue > 0 ? (netRent * 12) / p.marketValue : 0;
    const rankIdx = payoffOrder.indexOf(p.name);
    return {
      name: p.name,
      marketValue: p.marketValue,
      balance: p.balance,
      equity,
      ltv,
      capRate,
      payoffRank: rankIdx >= 0 ? rankIdx + 1 : null,
      monthlyNetRent: netRent,
    };
  });
}

export function comparisonAtHorizons(
  result: SimulationResult,
  horizons: number[] = [60, 120, 180],
): { month: number; equity: number; netWorth: number; ltv: number }[] {
  return horizons.map((month) => {
    const snap = snapshotAtMonth(result, month);
    const ltv =
      snap && snap.totalPropertyValue > 0
        ? snap.totalLiabilities / snap.totalPropertyValue
        : 0;
    return {
      month,
      equity: snap?.totalEquity ?? 0,
      netWorth: snap?.netWorth ?? 0,
      ltv,
    };
  });
}

/** Binary search for minimum extra budget to reach debt-free by target month. */
export function findBudgetForDebtFreeByMonth(
  portfolio: Portfolio,
  strategyId: StrategyId,
  targetMonth: number,
  maxBudget?: number,
): number | null {
  const piSum = portfolio.properties.reduce((s, p) => s + p.monthlyPayment, 0);
  let hi = maxBudget ?? Math.max(20000, Math.round(piSum * 2));
  let lo = 0;

  const canHit = (budget: number): boolean => {
    const testPortfolio = { ...portfolio, extraMonthlyBudget: budget };
    try {
      const result = runSimulation(testPortfolio, strategyId);
      return result.monthsToPayoff <= targetMonth;
    } catch {
      return false;
    }
  };

  if (!canHit(hi)) return null;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canHit(mid)) {
      hi = mid - 1;
    } else {
      lo = mid;
    }
  }

  return canHit(lo + 1) ? lo + 1 : null;
}

/** Binary search for minimum extra budget to reach equity target at a month. */
export function findBudgetForEquityAtMonth(
  portfolio: Portfolio,
  strategyId: StrategyId,
  targetMonth: number,
  targetEquity: number,
  maxBudget?: number,
): number | null {
  const piSum = portfolio.properties.reduce((s, p) => s + p.monthlyPayment, 0);
  let hi = maxBudget ?? Math.max(20000, Math.round(piSum * 2));
  let lo = 0;

  const meetsEquity = (budget: number): boolean => {
    const testPortfolio = { ...portfolio, extraMonthlyBudget: budget };
    try {
      const result = runSimulation(testPortfolio, strategyId);
      const snap = snapshotAtMonth(result, targetMonth);
      return (snap?.totalEquity ?? 0) >= targetEquity;
    } catch {
      return false;
    }
  };

  if (!meetsEquity(hi)) return null;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (meetsEquity(mid)) {
      hi = mid - 1;
    } else {
      lo = mid;
    }
  }

  return meetsEquity(lo + 1) ? lo + 1 : null;
}

export function generateInsights(
  portfolio: Portfolio,
  active: SimulationResult,
  baseline: SimulationResult,
  strategyId: StrategyId,
): string[] {
  const insights: string[] = [];
  const metrics = currentPortfolioMetrics(portfolio.properties);

  insights.push(
    `At current pace, debt-free in ${active.monthsToPayoff} months with ${formatCurrencyShort(active.finalEquity)} equity.`,
  );

  if (active.monthsToPayoff < baseline.monthsToPayoff) {
    insights.push(
      `Active strategy saves ${formatMonthsShort(baseline.monthsToPayoff - active.monthsToPayoff)} vs baseline and ${formatCurrencyShort(baseline.totalInterestPaid - active.totalInterestPaid)} in interest.`,
    );
  }

  const year10 = snapshotAtMonth(active, 120);
  if (year10) {
    insights.push(
      `Projected equity at year 10: ${formatCurrencyShort(year10.totalEquity)} (LTV ${(year10.totalLiabilities / year10.totalPropertyValue * 100).toFixed(0)}%).`,
    );
  }

  if (portfolio.extraMonthlyBudget > 0) {
    const bumped = findBudgetForDebtFreeByMonth(
      portfolio,
      strategyId,
      Math.max(1, active.monthsToPayoff - 12),
    );
    if (bumped && bumped > portfolio.extraMonthlyBudget) {
      insights.push(
        `Increasing budget to ${formatCurrencyShort(bumped)}/mo could move debt-free ~12 months earlier.`,
      );
    }
  }

  if (metrics.ltv > 0.7) {
    insights.push(
      `Portfolio LTV is ${(metrics.ltv * 100).toFixed(0)}% — equity builds as balances pay down and values appreciate.`,
    );
  }

  return insights;
}

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonthsShort(months: number): string {
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

/** Normalize raw JSON into a Portfolio (exported for tests and hook). */
export function normalizePortfolio(raw: unknown): Portfolio {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid portfolio: expected an object');
  }
  const obj = raw as Record<string, unknown>;
  const extraMonthlyBudget = obj.extra_monthly_budget;
  if (typeof extraMonthlyBudget !== 'number' || extraMonthlyBudget < 0) {
    throw new Error('Invalid extra_monthly_budget');
  }
  if (!Array.isArray(obj.properties)) {
    throw new Error('Invalid properties array');
  }

  const annualRentGrowthRate =
    typeof obj.annual_rent_growth_rate === 'number'
      ? obj.annual_rent_growth_rate
      : DEFAULT_RENT_GROWTH;
  const annualExpenseInflationRate =
    typeof obj.annual_expense_inflation_rate === 'number'
      ? obj.annual_expense_inflation_rate
      : DEFAULT_EXPENSE_INFLATION;
  const reinvestSurplus = obj.reinvest_surplus === true;
  const monthlyReserveTarget =
    typeof obj.monthly_reserve_target === 'number' ? obj.monthly_reserve_target : 0;
  const simulationAnchorYear =
    typeof obj.simulation_anchor_year === 'number'
      ? obj.simulation_anchor_year
      : 2026;

  const properties: Property[] = obj.properties.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid property at index ${i}`);
    }
    const p = item as Record<string, unknown>;
    const name = p.name;
    const balance = p.balance;
    const marketValue =
      typeof p.market_value === 'number'
        ? p.market_value
        : typeof p.marketValue === 'number'
          ? p.marketValue
          : (balance as number) * 1.5;
    const annualInterestRate = p.annual_interest_rate;
    const monthlyPayment = p.monthly_payment;
    const monthlyRent = p.monthly_rent;
    const monthlyExpenses = p.monthly_expenses;
    const annualAppreciationRate =
      typeof p.annual_appreciation_rate === 'number'
        ? p.annual_appreciation_rate
        : DEFAULT_APPRECIATION;

    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`Property ${i}: invalid name`);
    }
    for (const [key, val] of [
      ['balance', balance],
      ['market_value', marketValue],
      ['annual_interest_rate', annualInterestRate],
      ['monthly_payment', monthlyPayment],
      ['monthly_rent', monthlyRent],
      ['monthly_expenses', monthlyExpenses],
    ] as const) {
      if (typeof val !== 'number' || Number.isNaN(val)) {
        throw new Error(`Property "${name}": invalid ${key}`);
      }
    }

    const prop: Property = {
      name,
      balance: balance as number,
      marketValue: marketValue as number,
      annualInterestRate: annualInterestRate as number,
      annualAppreciationRate,
      monthlyPayment: monthlyPayment as number,
      monthlyRent: monthlyRent as number,
      monthlyExpenses: monthlyExpenses as number,
    };

    if (typeof p.annual_rent_growth_rate === 'number') {
      prop.annualRentGrowthRate = p.annual_rent_growth_rate;
    }
    if (typeof p.annual_expense_inflation_rate === 'number') {
      prop.annualExpenseInflationRate = p.annual_expense_inflation_rate;
    }

    if (typeof p.close_month === 'number') {
      prop.closeMonth = p.close_month;
    } else if (typeof p.close_year === 'number') {
      prop.closeMonth = closeMonthFromYear(p.close_year, simulationAnchorYear);
      prop.closeYear = p.close_year;
    }

    if (typeof p.balloon_months === 'number') {
      prop.balloonMonths = p.balloon_months;
    }

    return prop;
  });

  return {
    extraMonthlyBudget,
    annualRentGrowthRate,
    annualExpenseInflationRate,
    reinvestSurplus,
    monthlyReserveTarget,
    simulationAnchorYear,
    properties,
  };
}

/** Convert Portfolio back to snake_case JSON shape. */
export function denormalizePortfolio(
  portfolio: Portfolio,
): import('./types').PortfolioFile {
  return {
    extra_monthly_budget: portfolio.extraMonthlyBudget,
    simulation_anchor_year: portfolio.simulationAnchorYear,
    annual_rent_growth_rate: portfolio.annualRentGrowthRate,
    annual_expense_inflation_rate: portfolio.annualExpenseInflationRate,
    reinvest_surplus: portfolio.reinvestSurplus,
    monthly_reserve_target: portfolio.monthlyReserveTarget,
    properties: portfolio.properties.map((p) => {
      const file: import('./types').PropertyFile = {
        name: p.name,
        balance: p.balance,
        market_value: p.marketValue,
        annual_interest_rate: p.annualInterestRate,
        annual_appreciation_rate: p.annualAppreciationRate,
        monthly_payment: p.monthlyPayment,
        monthly_rent: p.monthlyRent,
        monthly_expenses: p.monthlyExpenses,
      };
      if (p.annualRentGrowthRate !== undefined) {
        file.annual_rent_growth_rate = p.annualRentGrowthRate;
      }
      if (p.annualExpenseInflationRate !== undefined) {
        file.annual_expense_inflation_rate = p.annualExpenseInflationRate;
      }
      if (p.closeYear !== undefined) {
        file.close_year = p.closeYear;
      } else if (p.closeMonth !== undefined && p.closeMonth > 1) {
        file.close_month = p.closeMonth;
      }
      if (p.balloonMonths !== undefined) {
        file.balloon_months = p.balloonMonths;
      }
      return file;
    }),
  };
}

export const SEED_PROPERTY_NAMES = {
  parkBlvd: 'Park Blvd (Plano, projected post-move-out)',
  desotoB: 'DeSoto Duplex B (0% seller-financed)',
  lisaLn: 'Lisa Ln (Cedar Hill)',
} as const;
