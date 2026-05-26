import { computeMonthlyPayment } from './tax';
import type {
  ExpenseBreakdown,
  GoalConfig,
  MonthSnapshot,
  Portfolio,
  Property,
  PropertyEvent,
  PropertyInsight,
  ScenarioConfig,
  SimulationResult,
} from './types';
import {
  denormalizeAcquisitionTemplate,
  denormalizeTaxProfile,
  normalizeAcquisitionTemplate,
  normalizeTaxProfile,
} from './tax';

const BALANCE_EPSILON = 0.01;
const DEFAULT_APPRECIATION = 0.03;
const DEFAULT_RENT_GROWTH = 0.025;
const DEFAULT_EXPENSE_INFLATION = 0.02;
export const DEFAULT_CAPEX_RESERVE_RATE = 0.1;
export const DEFAULT_VACANCY_RATE = 0;

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
  defaultVacancyRate?: number;
  defaultCapexReserveRate?: number;
  defaultCapexReserveFlat?: number;
  vacancyRate?: number;
  capexReserveRate?: number;
  capexReserveFlat?: number;
  rateShock?: number;
  pauseExtraMonths?: number;
  initialLumpSum?: number;
  timedSellScenario?: ScenarioConfig | null;
  /** When true, return partial history instead of throwing if maxMonths hit. */
  allowIncomplete?: boolean;
}

interface SimState {
  name: string;
  balance: number;
  marketValue: number;
  grossMonthlyRent: number;
  monthlyRent: number;
  monthlyExpenses: number;
  monthlyPayment: number;
  annualInterestRate: number;
  rentGrowth: number;
  expenseInflation: number;
  appreciation: number;
  capexReserveRate: number;
  capexReserveFlat: number;
  events: PropertyEvent[];
}

export { computeMonthlyPayment };

export function resolveMonthlyExpenses(p: Property): number {
  const b = p.expenseBreakdown;
  if (!b) return p.monthlyExpenses;
  const mgmt =
    b.managementPercent != null
      ? p.monthlyRent * b.managementPercent
      : (b.management ?? 0);
  const sum =
    (b.propertyTax ?? 0) +
    (b.insurance ?? 0) +
    (b.hoa ?? 0) +
    mgmt +
    (b.maintenance ?? 0) +
    (b.utilities ?? 0) +
    (b.other ?? 0);
  return sum > 0 ? sum : p.monthlyExpenses;
}

export function resolveCashInvested(p: Property): number {
  return p.cashInvested ?? p.marketValue - p.balance;
}

export function resolveCapexRate(
  p: Property,
  portfolio: Pick<Portfolio, 'defaultCapexReserveRate'>,
  scenario?: ScenarioConfig | null,
): number {
  if (p.capexReserveRate != null) return p.capexReserveRate;
  if (scenario?.capexReserveRate != null) return scenario.capexReserveRate;
  return portfolio.defaultCapexReserveRate;
}

export function resolveVacancyRate(
  p: Property,
  portfolio: Pick<Portfolio, 'defaultVacancyRate'>,
  scenario?: ScenarioConfig | null,
): number {
  if (p.vacancyRate != null) return p.vacancyRate;
  if (scenario?.vacancyRate != null) return scenario.vacancyRate;
  return portfolio.defaultVacancyRate;
}

export function propertyMonthlyCapex(
  grossRent: number,
  capexRate: number,
  capexFlat: number,
): number {
  return grossRent * capexRate + capexFlat;
}

export interface PropertyValidation {
  warnings: string[];
}

export function validateProperty(
  p: Property,
  portfolio: Portfolio,
  scenario?: ScenarioConfig | null,
): PropertyValidation {
  const warnings: string[] = [];
  const monthlyInterest = p.balance * (p.annualInterestRate / 12);
  if (p.balance > 0 && p.monthlyPayment < monthlyInterest - 1e-6) {
    warnings.push('P&I does not cover interest');
  }

  const capexRate = resolveCapexRate(p, portfolio, scenario);
  const capexFlat = p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat;
  const vacancy = resolveVacancyRate(p, portfolio, scenario);
  const effectiveRent = p.monthlyRent * (1 - vacancy);
  const capex = propertyMonthlyCapex(p.monthlyRent, capexRate, capexFlat);
  const netCf =
    effectiveRent - p.monthlyExpenses - (p.balance > 0 ? p.monthlyPayment : 0) - capex;
  if (netCf < 0) warnings.push('Negative cashflow after capex');

  const noi = (effectiveRent - p.monthlyExpenses) * 12;
  const debtService = p.monthlyPayment * 12;
  const dscr = debtService > 0 ? noi / debtService : Infinity;
  if (dscr < 1 && p.balance > 0) warnings.push('DSCR below 1.0');

  const ltv = p.marketValue > 0 ? p.balance / p.marketValue : 0;
  if (ltv > 0.8) warnings.push('LTV above 80%');

  return { warnings };
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

function compoundGrowth(states: SimState[]): void {
  for (const s of states) {
    s.marketValue *= monthlyGrowthFactor(s.appreciation);
    s.grossMonthlyRent *= monthlyGrowthFactor(s.rentGrowth);
    s.monthlyRent = s.grossMonthlyRent;
    s.monthlyExpenses *= monthlyGrowthFactor(s.expenseInflation);
  }
}

function propertyToSimState(
  p: Property,
  options: SimulationOptions,
): SimState {
  const portfolioRentGrowth = options.annualRentGrowthRate ?? DEFAULT_RENT_GROWTH;
  const portfolioExpenseInflation =
    options.annualExpenseInflationRate ?? DEFAULT_EXPENSE_INFLATION;
  const vacancy =
    p.vacancyRate ?? options.vacancyRate ?? options.defaultVacancyRate ?? 0;
  const rateShock = options.rateShock ?? 0;
  const capexRate =
    p.capexReserveRate ??
    options.capexReserveRate ??
    options.defaultCapexReserveRate ??
    0;
  const capexFlat = p.capexReserveFlat ?? options.defaultCapexReserveFlat ?? 0;

  return {
    name: p.name,
    balance: p.balance,
    marketValue: p.marketValue,
    grossMonthlyRent: p.monthlyRent,
    monthlyRent: p.monthlyRent * (1 - vacancy),
    monthlyExpenses: resolveMonthlyExpenses(p),
    monthlyPayment: p.monthlyPayment,
    annualInterestRate: p.annualInterestRate + rateShock,
    rentGrowth: p.annualRentGrowthRate ?? portfolioRentGrowth,
    expenseInflation: p.annualExpenseInflationRate ?? portfolioExpenseInflation,
    appreciation: p.annualAppreciationRate,
    capexReserveRate: capexRate,
    capexReserveFlat: capexFlat,
    events: p.events ?? [],
  };
}

function initSimStates(properties: Property[], options: SimulationOptions): SimState[] {
  return properties.map((p) => propertyToSimState(p, options));
}

function applyPropertyEvents(
  states: SimState[],
  month: number,
  options: SimulationOptions,
): number {
  let capexSpikeTotal = 0;
  const toRemove: string[] = [];
  const toAdd: SimState[] = [];

  for (const s of states) {
    for (const ev of s.events) {
      if (ev.month !== month) continue;
      switch (ev.type) {
        case 'rentChange':
          if (ev.rent != null) {
            s.grossMonthlyRent = ev.rent;
            const vacancy =
              options.vacancyRate ?? options.defaultVacancyRate ?? 0;
            s.monthlyRent = ev.rent * (1 - vacancy);
          }
          break;
        case 'rateReset':
          if (ev.rate != null) s.annualInterestRate = ev.rate;
          break;
        case 'refinance':
          if (ev.rate != null) s.annualInterestRate = ev.rate;
          if (ev.payment != null) s.monthlyPayment = ev.payment;
          if (ev.balance != null) s.balance = ev.balance;
          break;
        case 'capexSpike':
          if (ev.amount != null) capexSpikeTotal += ev.amount;
          break;
        case 'disposition':
          toRemove.push(s.name);
          break;
        case 'acquisition':
          if (ev.property) {
            toAdd.push(propertyToSimState(ev.property as Property, options));
          }
          break;
        default:
          break;
      }
    }
  }

  if (toRemove.length > 0) {
    const removeSet = new Set(toRemove);
    for (let i = states.length - 1; i >= 0; i -= 1) {
      if (removeSet.has(states[i].name)) states.splice(i, 1);
    }
  }
  states.push(...toAdd);
  return capexSpikeTotal;
}

function computeMonthlyCashflow(states: SimState[]): number {
  return states.reduce((sum, s) => {
    const netRent = s.monthlyRent - s.monthlyExpenses;
    if (s.balance <= BALANCE_EPSILON) return sum + netRent;
    return sum + (netRent - s.monthlyPayment);
  }, 0);
}

function computeMonthlyPi(states: SimState[]): number {
  return states.reduce((sum, s) => {
    if (s.balance <= BALANCE_EPSILON) return sum;
    return sum + s.monthlyPayment;
  }, 0);
}

function computeCapexDeduction(states: SimState[]): number {
  return states.reduce(
    (sum, s) =>
      sum + propertyMonthlyCapex(s.grossMonthlyRent, s.capexReserveRate, s.capexReserveFlat),
    0,
  );
}

function buildEquitySnapshot(
  states: SimState[],
  cashReserve: number,
  month: number,
  monthInterest: number,
  monthPrincipal: number,
  monthExtra: number,
  monthlyCashflow: number,
  monthlyCapex: number,
  target: string | null,
  paidOffThisMonth: string[],
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
    balancesByName,
    valuesByName,
    equityByName,
    totalEquity,
    totalPropertyValue,
    totalLiabilities: totalBalance,
    netWorth: totalEquity + cashReserve,
    monthlyRent: states.reduce((s, p) => s + p.monthlyRent, 0),
    monthlyExpenses: states.reduce((s, p) => s + p.monthlyExpenses, 0),
    monthlyPi: computeMonthlyPi(states),
    monthlyCapex,
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
  lowestDscr: (properties: Property[]) =>
    [...properties]
      .sort((a, b) => {
        const dscrA =
          a.monthlyPayment > 0
            ? (a.monthlyRent - a.monthlyExpenses) / a.monthlyPayment
            : Infinity;
        const dscrB =
          b.monthlyPayment > 0
            ? (b.monthlyRent - b.monthlyExpenses) / b.monthlyPayment
            : Infinity;
        return dscrA - dscrB;
      })
      .map((p) => p.name),
  highestInterestCost: (properties: Property[]) =>
    [...properties]
      .sort(
        (a, b) =>
          b.balance * b.annualInterestRate - a.balance * a.annualInterestRate,
      )
      .map((p) => p.name),
} as const satisfies Record<string, StrategyFn>;

export const STRATEGY_LABELS: Record<keyof typeof STRATEGIES, string> = {
  highestRate: 'Highest Rate (Avalanche)',
  highestPiPerDollar: 'Highest P&I per $ Balance',
  highestCashflowBoost: 'Highest Cashflow Boost',
  lowestBalance: 'Lowest Balance (Snowball)',
  lowestDscr: 'Lowest DSCR First',
  highestInterestCost: 'Highest Interest Cost',
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
): string | null {
  return (
    payoffOrder.find((name) => {
      const s = states.find((p) => p.name === name);
      return s && s.balance > BALANCE_EPSILON;
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

function handleTimedSale(
  states: SimState[],
  scenario: ScenarioConfig,
  extraPoolRef: { value: number },
  cashReserveRef: { value: number },
): void {
  const sold = states.find((s) => s.name === scenario.sellProperty);
  if (!sold) return;

  const closingRate = scenario.sellClosingCostRate ?? 0.06;
  const proceeds = sold.marketValue * (1 - closingRate) - sold.balance;
  const toDebt = proceeds * (scenario.sellProceedsToDebt ?? 1);
  const toCash = proceeds - toDebt;
  extraPoolRef.value += Math.max(0, toDebt);
  cashReserveRef.value += Math.max(0, toCash);

  const idx = states.findIndex((s) => s.name === scenario.sellProperty);
  if (idx >= 0) states.splice(idx, 1);
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
  const pauseExtraMonths = options.pauseExtraMonths ?? 0;
  let initialLumpSum = options.initialLumpSum ?? 0;
  const timedSell = options.timedSellScenario;

  if (extraMonthlyBudget < 0) {
    throw new Error('extraMonthlyBudget must be non-negative');
  }

  const states = initSimStates(properties, options);
  let payoffOrder = [...options.payoffOrder];
  const propertyNames = new Set(states.map((p) => p.name));
  validatePayoffOrder(payoffOrder, propertyNames);

  const history: MonthSnapshot[] = [];
  const payoffSchedule: Record<string, number> = {};
  let totalInterestPaid = 0;
  let totalExtraPaid = 0;
  let cashReserve = 0;
  let cumulativeRent = 0;
  let cumulativeExpenses = 0;
  let cumulativeCashflow = 0;

  for (let month = 1; month <= maxMonths; month += 1) {
    const eventCapexSpike = applyPropertyEvents(states, month, options);
    if (timedSell?.sellProperty && (timedSell.sellAtMonth ?? 1) === month) {
      const pool = { value: 0 };
      const reserve = { value: cashReserve };
      handleTimedSale(states, timedSell, pool, reserve);
      cashReserve = reserve.value;
      initialLumpSum += pool.value;
      payoffOrder = payoffOrder.filter((n) => n !== timedSell.sellProperty);
    }

    if (month > 1) {
      compoundGrowth(states);
    }

    const activeCount = states.filter((s) => s.balance > BALANCE_EPSILON).length;
    if (activeCount === 0) break;

    const effectiveBudget = month <= pauseExtraMonths ? 0 : extraMonthlyBudget;
    let extraPool = effectiveBudget;

    if (snowballCashflow) {
      for (const s of states) {
        if (s.balance <= BALANCE_EPSILON) {
          extraPool += s.monthlyPayment;
        }
      }
    }

    if (month === 1 && initialLumpSum > 0) {
      extraPool += initialLumpSum;
      initialLumpSum = 0;
    }

    const target = findTarget(payoffOrder, states);

    let monthInterest = 0;
    let monthPrincipal = 0;
    let monthExtra = 0;
    const paidOffThisMonth: string[] = [];

    for (const s of states) {
      const startBal = s.balance;
      if (startBal <= BALANCE_EPSILON) continue;

      const result = amortizeOneMonth({
        balance: startBal,
        annualInterestRate: s.annualInterestRate,
        scheduledPayment: s.monthlyPayment,
        extraPayment: 0,
        propertyName: s.name,
      });

      let newBal = result.balance;
      monthInterest += result.interestPaid;
      monthPrincipal += result.principalPaid;

      if (s.name === target && extraPool > 0) {
        const beforeExtra = newBal;
        newBal = applyExtraPrincipal(newBal, extraPool);
        const applied = beforeExtra - newBal;
        monthExtra += applied;
        monthPrincipal += applied;
        extraPool = 0;
      }

      s.balance = newBal;

      if (newBal <= BALANCE_EPSILON && startBal > BALANCE_EPSILON) {
        paidOffThisMonth.push(s.name);
        if (!(s.name in payoffSchedule)) {
          payoffSchedule[s.name] = month;
        }
      }
    }

    cumulativeRent += states.reduce((sum, s) => sum + s.monthlyRent, 0);
    cumulativeExpenses += states.reduce((sum, s) => sum + s.monthlyExpenses, 0);

    let monthlyCashflow = computeMonthlyCashflow(states);
    const capexDeduction = computeCapexDeduction(states) + eventCapexSpike;
    monthlyCashflow -= capexDeduction;

    if (monthlyCashflow > 0) {
      cumulativeCashflow += monthlyCashflow;
    }

    const surplus = monthlyCashflow - monthlyReserveTarget;
    if (surplus > 0) {
      if (reinvestSurplus) {
        const balancesBeforeReinvest = new Map(states.map((s) => [s.name, s.balance]));
        const currentTarget = findTarget(payoffOrder, states);
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
        capexDeduction,
        target,
        paidOffThisMonth,
        cumulativeRent,
        cumulativeExpenses,
        cumulativeCashflow,
      ),
    );

    const totalBalance = states.reduce((s, p) => s + p.balance, 0);
    if (totalBalance <= BALANCE_EPSILON) break;
  }

  const remaining = states.some((s) => s.balance > BALANCE_EPSILON);
  if (remaining && !options.allowIncomplete) {
    throw new Error(
      `Simulation did not converge within ${maxMonths} months`,
    );
  }

  const finalMonthlyCashflow = states.reduce((sum, s) => {
    const capex = propertyMonthlyCapex(
      s.grossMonthlyRent,
      s.capexReserveRate,
      s.capexReserveFlat,
    );
    return sum + (s.monthlyRent - s.monthlyExpenses - capex);
  }, 0);
  const finalEquity = states.reduce(
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
    history,
    finalEquity,
    finalNetWorth: lastSnapshot?.netWorth ?? finalEquity,
  };
}

function portfolioSimOptions(
  portfolio: Portfolio,
  scenario?: ScenarioConfig | null,
): Omit<SimulationOptions, 'payoffOrder' | 'strategyName'> {
  const base: Omit<SimulationOptions, 'payoffOrder' | 'strategyName'> = {
    extraMonthlyBudget: portfolio.extraMonthlyBudget,
    annualRentGrowthRate: portfolio.annualRentGrowthRate,
    annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
    reinvestSurplus: portfolio.reinvestSurplus,
    monthlyReserveTarget: portfolio.monthlyReserveTarget,
    defaultVacancyRate: portfolio.defaultVacancyRate,
    defaultCapexReserveRate: portfolio.defaultCapexReserveRate,
    defaultCapexReserveFlat: portfolio.defaultCapexReserveFlat,
  };

  if (!scenario || scenario.id === 'base') return base;

  return {
    ...base,
    vacancyRate: scenario.vacancyRate,
    capexReserveRate: scenario.capexReserveRate,
    capexReserveFlat: scenario.capexReserveFlat,
    rateShock: scenario.rateShock,
    pauseExtraMonths: scenario.pauseExtraMonths,
    timedSellScenario:
      scenario.sellProperty && (scenario.sellAtMonth ?? 1) > 1 ? scenario : null,
  };
}

export function applyScenario(
  portfolio: Portfolio,
  scenario: ScenarioConfig | null,
): { properties: Property[]; initialLumpSum: number } {
  if (!scenario || scenario.id === 'base' || !scenario.sellProperty) {
    return { properties: portfolio.properties, initialLumpSum: 0 };
  }

  const sellMonth = scenario.sellAtMonth ?? 1;
  if (sellMonth > 1) {
    return { properties: portfolio.properties, initialLumpSum: 0 };
  }

  const sold = portfolio.properties.find((p) => p.name === scenario.sellProperty);
  if (!sold) {
    return { properties: portfolio.properties, initialLumpSum: 0 };
  }

  const closingRate = scenario.sellClosingCostRate ?? 0.06;
  const proceeds = sold.marketValue * (1 - closingRate) - sold.balance;
  const toDebt = proceeds * (scenario.sellProceedsToDebt ?? 1);
  const remaining = portfolio.properties.filter((p) => p.name !== scenario.sellProperty);

  return {
    properties: remaining,
    initialLumpSum: Math.max(0, toDebt),
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

export function compareStrategies(
  properties: Property[],
  options?: {
    extraMonthlyBudget?: number;
    includeBaseline?: boolean;
    simulationOptions?: Omit<
      SimulationOptions,
      'payoffOrder' | 'strategyName' | 'extraMonthlyBudget'
    >;
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

export function snapshotAtMonth(
  result: SimulationResult,
  month: number,
): MonthSnapshot | null {
  if (result.history.length === 0) return null;
  const idx = Math.min(Math.max(month, 1), result.history.length) - 1;
  return result.history[idx] ?? null;
}

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
  portfolio: Portfolio,
  payoffOrder: string[],
  scenario?: ScenarioConfig | null,
): PropertyInsight[] {
  return portfolio.properties.map((p) => {
    const equity = p.marketValue - p.balance;
    const ltv = p.marketValue > 0 ? p.balance / p.marketValue : 0;
    const vacancy = resolveVacancyRate(p, portfolio, scenario);
    const effectiveRent = p.monthlyRent * (1 - vacancy);
    const netRent = effectiveRent - p.monthlyExpenses;
    const capexRate = resolveCapexRate(p, portfolio, scenario);
    const capexFlat = p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat;
    const monthlyCapexReserve = propertyMonthlyCapex(p.monthlyRent, capexRate, capexFlat);
    const capRate = p.marketValue > 0 ? (netRent * 12) / p.marketValue : 0;
    const rankIdx = payoffOrder.indexOf(p.name);
    const noi = (effectiveRent - p.monthlyExpenses) * 12;
    const debtService = p.monthlyPayment * 12;
    const dscr = debtService > 0 && p.balance > 0 ? noi / debtService : Infinity;
    const cashInvested = resolveCashInvested(p);
    const annualCf = (netRent - (p.balance > 0 ? p.monthlyPayment : 0) - monthlyCapexReserve) * 12;
    const cashOnCash = cashInvested > 0 ? annualCf / cashInvested : 0;
    const grossRent = p.monthlyRent;
    const breakEvenOccupancy =
      grossRent > 0
        ? (p.monthlyExpenses + (p.balance > 0 ? p.monthlyPayment : 0) + monthlyCapexReserve) /
          grossRent
        : 0;
    const monthlyInterest = p.balance * (p.annualInterestRate / 12);
    const interestToIncomeRatio = netRent > 0 ? monthlyInterest / netRent : 0;
    const { warnings } = validateProperty(p, portfolio, scenario);

    return {
      name: p.name,
      marketValue: p.marketValue,
      balance: p.balance,
      equity,
      ltv,
      capRate,
      payoffRank: rankIdx >= 0 ? rankIdx + 1 : null,
      monthlyNetRent: netRent,
      dscr,
      cashOnCash,
      breakEvenOccupancy,
      interestToIncomeRatio,
      monthlyCapexReserve,
      warnings,
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
      `Projected equity at year 10: ${formatCurrencyShort(year10.totalEquity)} (LTV ${((year10.totalLiabilities / year10.totalPropertyValue) * 100).toFixed(0)}%).`,
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

function normalizeExpenseBreakdown(raw: Record<string, unknown> | undefined) {
  if (!raw) return undefined;
  const b: ExpenseBreakdown = {};
  if (typeof raw.property_tax === 'number') b.propertyTax = raw.property_tax;
  if (typeof raw.insurance === 'number') b.insurance = raw.insurance;
  if (typeof raw.hoa === 'number') b.hoa = raw.hoa;
  if (typeof raw.management === 'number') b.management = raw.management;
  if (typeof raw.management_percent === 'number') b.managementPercent = raw.management_percent;
  if (typeof raw.maintenance === 'number') b.maintenance = raw.maintenance;
  if (typeof raw.utilities === 'number') b.utilities = raw.utilities;
  if (typeof raw.other === 'number') b.other = raw.other;
  return Object.keys(b).length > 0 ? b : undefined;
}

function normalizeProperty(item: unknown, i: number): Property {
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

  const optionalNums: [keyof Property, string][] = [
    ['annualRentGrowthRate', 'annual_rent_growth_rate'],
    ['annualExpenseInflationRate', 'annual_expense_inflation_rate'],
    ['vacancyRate', 'vacancy_rate'],
    ['capexReserveRate', 'capex_reserve_rate'],
    ['capexReserveFlat', 'capex_reserve_flat'],
    ['cashInvested', 'cash_invested'],
    ['originalLoanAmount', 'original_loan_amount'],
    ['remainingTermMonths', 'remaining_term_months'],
    ['purchasePrice', 'purchase_price'],
    ['landPercent', 'land_percent'],
    ['placedInServiceYear', 'placed_in_service_year'],
    ['costSegPercent', 'cost_seg_percent'],
    ['bonusEligiblePercent', 'bonus_eligible_percent'],
  ];

  for (const [camel, snake] of optionalNums) {
    if (typeof p[snake] === 'number') {
      (prop as unknown as Record<string, number>)[camel as string] = p[snake] as number;
    }
  }

  if (p.use_cost_seg === true) prop.useCostSeg = true;
  if (p.use_cost_seg === false) prop.useCostSeg = false;

  const breakdown = normalizeExpenseBreakdown(
    p.expense_breakdown as Record<string, unknown> | undefined,
  );
  if (breakdown) prop.expenseBreakdown = breakdown;

  if (Array.isArray(p.events)) {
    prop.events = p.events as PropertyEvent[];
  }

  return prop;
}

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

  const properties = obj.properties.map(normalizeProperty);

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
  const defaultVacancyRate =
    typeof obj.default_vacancy_rate === 'number'
      ? obj.default_vacancy_rate
      : DEFAULT_VACANCY_RATE;
  const defaultCapexReserveRate =
    typeof obj.default_capex_reserve_rate === 'number'
      ? obj.default_capex_reserve_rate
      : DEFAULT_CAPEX_RESERVE_RATE;
  const defaultCapexReserveFlat =
    typeof obj.default_capex_reserve_flat === 'number'
      ? obj.default_capex_reserve_flat
      : 0;

  const partialPortfolio = {
    extraMonthlyBudget,
    annualRentGrowthRate,
    annualExpenseInflationRate,
    reinvestSurplus,
    monthlyReserveTarget,
    defaultVacancyRate,
    defaultCapexReserveRate,
    defaultCapexReserveFlat,
    taxProfile: normalizeTaxProfile(
      obj.tax_profile as Parameters<typeof normalizeTaxProfile>[0],
    ),
    acquisitionTemplate: normalizeAcquisitionTemplate(
      obj.acquisition_template as Parameters<typeof normalizeAcquisitionTemplate>[0],
    ),
    goals: Array.isArray(obj.goals) ? (obj.goals as GoalConfig[]) : [],
    properties,
  };

  partialPortfolio.acquisitionTemplate = normalizeAcquisitionTemplate(
    obj.acquisition_template as Parameters<typeof normalizeAcquisitionTemplate>[0],
    partialPortfolio as Portfolio,
  );

  return partialPortfolio;
}

export function denormalizePortfolio(portfolio: Portfolio): import('./types').PortfolioFile {
  return {
    extra_monthly_budget: portfolio.extraMonthlyBudget,
    annual_rent_growth_rate: portfolio.annualRentGrowthRate,
    annual_expense_inflation_rate: portfolio.annualExpenseInflationRate,
    reinvest_surplus: portfolio.reinvestSurplus,
    monthly_reserve_target: portfolio.monthlyReserveTarget,
    default_vacancy_rate: portfolio.defaultVacancyRate,
    default_capex_reserve_rate: portfolio.defaultCapexReserveRate,
    default_capex_reserve_flat: portfolio.defaultCapexReserveFlat,
    tax_profile: denormalizeTaxProfile(portfolio.taxProfile),
    acquisition_template: denormalizeAcquisitionTemplate(portfolio.acquisitionTemplate),
    goals: portfolio.goals.length > 0 ? portfolio.goals : undefined,
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
      if (p.vacancyRate !== undefined) file.vacancy_rate = p.vacancyRate;
      if (p.capexReserveRate !== undefined) file.capex_reserve_rate = p.capexReserveRate;
      if (p.capexReserveFlat !== undefined) file.capex_reserve_flat = p.capexReserveFlat;
      if (p.cashInvested !== undefined) file.cash_invested = p.cashInvested;
      if (p.originalLoanAmount !== undefined) file.original_loan_amount = p.originalLoanAmount;
      if (p.remainingTermMonths !== undefined) file.remaining_term_months = p.remainingTermMonths;
      if (p.purchasePrice !== undefined) file.purchase_price = p.purchasePrice;
      if (p.landPercent !== undefined) file.land_percent = p.landPercent;
      if (p.placedInServiceYear !== undefined) {
        file.placed_in_service_year = p.placedInServiceYear;
      }
      if (p.useCostSeg !== undefined) file.use_cost_seg = p.useCostSeg;
      if (p.costSegPercent !== undefined) file.cost_seg_percent = p.costSegPercent;
      if (p.bonusEligiblePercent !== undefined) {
        file.bonus_eligible_percent = p.bonusEligiblePercent;
      }
      if (p.events?.length) file.events = p.events;
      if (p.expenseBreakdown) {
        file.expense_breakdown = {
          property_tax: p.expenseBreakdown.propertyTax,
          insurance: p.expenseBreakdown.insurance,
          hoa: p.expenseBreakdown.hoa,
          management: p.expenseBreakdown.management,
          management_percent: p.expenseBreakdown.managementPercent,
          maintenance: p.expenseBreakdown.maintenance,
          utilities: p.expenseBreakdown.utilities,
          other: p.expenseBreakdown.other,
        };
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
