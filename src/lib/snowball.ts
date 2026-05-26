import { calendarToSimMonth } from './format';
import { computeMonthlyPayment } from './tax';
import type {
  ExpenseBreakdown,
  GoalConfig,
  MonthSnapshot,
  Portfolio,
  Property,
  PropertyEvent,
  PortfolioYearMetrics,
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
const DEFAULT_BALLOON_REFI_RATE = 0.0675;
const DEFAULT_BALLOON_REFI_TERM_MONTHS = 360;

/** Fixed-rate monthly P&I from principal, annual rate, and term. */
export function paymentFromPrincipal(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualInterestRate <= 0) return principal / termMonths;
  const r = annualInterestRate / 12;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

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
  /** Lump-sum extra principal applied in month 1 to the first active target. */
  initialLumpSum?: number;
  timedSellScenario?: ScenarioConfig | null;
  /** If true, return history even when balances remain after maxMonths. */
  allowIncomplete?: boolean;
  allowUnresolved?: boolean;
}

/** Monthly utilities from gross rent when a rate is configured. */
export function utilitiesFromRent(monthlyRent: number, utilitiesRentRate?: number): number {
  if (!utilitiesRentRate || utilitiesRentRate <= 0) return 0;
  return monthlyRent * utilitiesRentRate;
}

/** Total monthly expenses (operating + utilities). */
export function totalMonthlyExpenses(
  monthlyRent: number,
  monthlyOperatingExpenses: number,
  utilitiesRentRate?: number,
): number {
  return monthlyOperatingExpenses + utilitiesFromRent(monthlyRent, utilitiesRentRate);
}

interface SimState {
  name: string;
  balance: number;
  marketValue: number;
  grossMonthlyRent: number;
  monthlyRent: number;
  monthlyExpenses: number;
  utilitiesRentRate?: number;
  monthlyPayment: number;
  annualInterestRate: number;
  rentGrowth: number;
  expenseInflation: number;
  appreciation: number;
  vacancyRate: number;
  capexReserveRate: number;
  capexReserveFlat: number;
  events: PropertyEvent[];
  closeMonth: number;
  refiSimMonth?: number;
  balloonRefiAnnualRate: number;
  balloonRefiTermMonths: number;
  sellerPayoffCap?: number;
  originalBalance: number;
  originalMarketValue: number;
  originalGrossRent: number;
  originalRent: number;
  originalExpenses: number;
}

export { computeMonthlyPayment };

export function resolveMonthlyExpenses(p: Property): number {
  const b = p.expenseBreakdown;
  const basis = p.purchasePrice ?? p.marketValue;
  const propertyTax =
    b?.propertyTax ??
    (p.propertyTaxRate != null && basis > 0
      ? (basis * p.propertyTaxRate) / 12
      : undefined);
  const insurance =
    b?.insurance ??
    (p.annualInsurance != null ? p.annualInsurance / 12 : undefined);

  if (propertyTax == null && insurance == null && !b) return p.monthlyExpenses;

  const mgmt =
    b?.managementPercent != null
      ? p.monthlyRent * b.managementPercent
      : (b?.management ?? 0);
  const sum =
    (propertyTax ?? 0) +
    (insurance ?? 0) +
    (b?.hoa ?? 0) +
    mgmt +
    (b?.maintenance ?? 0) +
    (b?.utilities ?? 0) +
    (b?.other ?? 0);
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
  const operating = resolveMonthlyExpenses(p);
  const totalExpenses = totalMonthlyExpenses(p.monthlyRent, operating, p.utilitiesRentRate);
  const capex = propertyMonthlyCapex(p.monthlyRent, capexRate, capexFlat);
  const netCf =
    effectiveRent - totalExpenses - (p.balance > 0 ? p.monthlyPayment : 0) - capex;
  if (netCf < 0) warnings.push('Negative cashflow after capex');

  const noi = (effectiveRent - totalExpenses) * 12;
  const debtService = p.monthlyPayment * 12;
  const dscr = debtService > 0 ? noi / debtService : Infinity;
  if (dscr < 1 && p.balance > 0) warnings.push('DSCR below 1.0');

  return { warnings };
}

function isPropertyOwned(state: SimState, month: number): boolean {
  return month >= state.closeMonth;
}

function scheduledPaymentForMonth(state: SimState, month: number): number {
  if (!isPropertyOwned(state, month) || state.balance <= BALANCE_EPSILON) {
    return 0;
  }
  return state.monthlyPayment;
}

function isBalloonRefiMonth(state: SimState, month: number): boolean {
  return (
    state.refiSimMonth != null &&
    isPropertyOwned(state, month) &&
    month === state.refiSimMonth &&
    state.balance > BALANCE_EPSILON
  );
}

/**
 * Yield-maintenance balloon: payoff cap minus aggregate P&I paid since close.
 * Matches rider language (e.g. $440,000 ? payments made).
 */
function applySellerYieldMaintenanceBalloon(state: SimState, refiMonth: number): void {
  if (state.sellerPayoffCap == null || state.sellerPayoffCap <= 0) return;
  const monthsPaid = refiMonth - state.closeMonth;
  if (monthsPaid <= 0) return;
  const aggregatePaid = state.monthlyPayment * monthsPaid;
  state.balance = Math.max(0, state.sellerPayoffCap - aggregatePaid);
}

/**
 * Derive note principal and payment for IRS-stated rate with a fixed seller payoff cap.
 * Total P&I through balloon month + remaining balance ? sellerPayoffCap.
 */
export function computeSellerFinancingTerms(
  sellerPayoffCap: number,
  annualRate = 0.06,
  amortMonths = 240,
  balloonMonths = 60,
): {
  principal: number;
  monthlyPayment: number;
  balloonBalance: number;
} {
  if (sellerPayoffCap <= 0 || balloonMonths <= 0 || amortMonths <= 0) {
    throw new Error('sellerPayoffCap, balloonMonths, and amortMonths must be positive');
  }

  let lo = 0;
  let hi = sellerPayoffCap;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const payment = paymentFromPrincipal(mid, annualRate, amortMonths);
    const totalPaid = payment * balloonMonths;
    const balloonBalance = sellerPayoffCap - totalPaid;
    const r = annualRate / 12;
    let bal = mid;
    for (let m = 0; m < balloonMonths; m += 1) {
      const interest = bal * r;
      bal -= payment - interest;
    }
    const scheduleBalloon = bal;
    if (scheduleBalloon > balloonBalance) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const principal = (lo + hi) / 2;
  const monthlyPayment = paymentFromPrincipal(principal, annualRate, amortMonths);
  const balloonBalance = sellerPayoffCap - monthlyPayment * balloonMonths;
  return { principal, monthlyPayment, balloonBalance };
}

/** Convert remaining seller-financed balance into a conventional amortizing loan. */
function refinanceAfterBalloon(state: SimState): void {
  if (state.balance <= BALANCE_EPSILON) {
    state.refiSimMonth = undefined;
    return;
  }
  const rate = state.balloonRefiAnnualRate;
  const term = state.balloonRefiTermMonths;
  state.annualInterestRate = rate;
  state.monthlyPayment = paymentFromPrincipal(state.balance, rate, term);
  state.refiSimMonth = undefined;
}

function allLoansResolved(states: SimState[], month: number): boolean {
  return states.every(
    (s) => isPropertyOwned(s, month) && s.balance <= BALANCE_EPSILON,
  );
}

function stateUtilities(state: SimState): number {
  return utilitiesFromRent(state.monthlyRent, state.utilitiesRentRate);
}

function stateTotalExpenses(state: SimState): number {
  return state.monthlyExpenses + stateUtilities(state);
}

function activateProperty(state: SimState): void {
  state.balance = state.originalBalance;
  state.marketValue = state.originalMarketValue;
  state.grossMonthlyRent = state.originalGrossRent;
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
    s.grossMonthlyRent *= monthlyGrowthFactor(s.rentGrowth);
    s.monthlyRent = s.grossMonthlyRent * (1 - s.vacancyRate);
    s.monthlyExpenses *= monthlyGrowthFactor(s.expenseInflation);
  }
}

function propertyToSimState(p: Property, options: SimulationOptions): SimState {
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
  const closeMonth = p.closeMonth ?? 1;
  const activeAtStart = closeMonth <= 1;
  const grossRent = p.monthlyRent;
  const effectiveRent = grossRent * (1 - vacancy);
  const operating = resolveMonthlyExpenses(p);

  return {
    name: p.name,
    balance: activeAtStart ? p.balance : 0,
    marketValue: activeAtStart ? p.marketValue : 0,
    grossMonthlyRent: activeAtStart ? grossRent : 0,
    monthlyRent: activeAtStart ? effectiveRent : 0,
    monthlyExpenses: activeAtStart ? operating : 0,
    utilitiesRentRate: p.utilitiesRentRate,
    monthlyPayment: p.monthlyPayment,
    annualInterestRate: p.annualInterestRate + rateShock,
    rentGrowth: p.annualRentGrowthRate ?? portfolioRentGrowth,
    expenseInflation: p.annualExpenseInflationRate ?? portfolioExpenseInflation,
    appreciation: p.annualAppreciationRate,
    vacancyRate: vacancy,
    capexReserveRate: capexRate,
    capexReserveFlat: capexFlat,
    events: p.events ?? [],
    closeMonth,
    refiSimMonth: p.refiSimMonth,
    balloonRefiAnnualRate: p.balloonRefiAnnualRate ?? DEFAULT_BALLOON_REFI_RATE,
    balloonRefiTermMonths: p.balloonRefiTermMonths ?? DEFAULT_BALLOON_REFI_TERM_MONTHS,
    sellerPayoffCap: p.sellerPayoffCap,
    originalBalance: p.balance,
    originalMarketValue: p.marketValue,
    originalGrossRent: grossRent,
    originalRent: effectiveRent,
    originalExpenses: operating,
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
            s.monthlyRent = ev.rent * (1 - s.vacancyRate);
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

function computeMonthlyCashflow(states: SimState[], month: number): number {
  return states.reduce((sum, s) => {
    if (!isPropertyOwned(s, month)) return sum;
    const netRent = s.monthlyRent - stateTotalExpenses(s);
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

function computeCapexDeduction(states: SimState[], month: number): number {
  return states.reduce((sum, s) => {
    if (!isPropertyOwned(s, month)) return sum;
    return (
      sum + propertyMonthlyCapex(s.grossMonthlyRent, s.capexReserveRate, s.capexReserveFlat)
    );
  }, 0);
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
  refinancedThisMonth: string[],
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
    refinancedThisMonth,
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
    monthlyOperatingExpenses: states.reduce(
      (sum, p) => sum + (isPropertyOwned(p, month) ? p.monthlyExpenses : 0),
      0,
    ),
    monthlyUtilities: states.reduce(
      (sum, p) => sum + (isPropertyOwned(p, month) ? stateUtilities(p) : 0),
      0,
    ),
    monthlyExpenses: states.reduce(
      (sum, p) => sum + (isPropertyOwned(p, month) ? stateTotalExpenses(p) : 0),
      0,
    ),
    monthlyPi: computeMonthlyPi(states, month),
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
  const refinanceSchedule: Record<string, number> = {};
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

    const target = findTarget(payoffOrder, states, month);
    const refinancedThisMonth: string[] = [];

    let monthInterest = 0;
    let monthPrincipal = 0;
    let monthExtra = 0;
    const paidOffThisMonth: string[] = [];

    for (const s of states) {
      if (!isPropertyOwned(s, month) || s.balance <= BALANCE_EPSILON) continue;

      const startBal = s.balance;
      const balloonRefi = isBalloonRefiMonth(s, month);

      if (balloonRefi) {
        applySellerYieldMaintenanceBalloon(s, month);
        refinanceAfterBalloon(s);
        refinancedThisMonth.push(s.name);
        if (!(s.name in refinanceSchedule)) {
          refinanceSchedule[s.name] = month;
        }
      }

      const payment = scheduledPaymentForMonth(s, month);
      const amortizeBalance = balloonRefi ? s.balance : startBal;
      const result = amortizeOneMonth({
        balance: amortizeBalance,
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
      (sum, st) => sum + (isPropertyOwned(st, month) ? stateTotalExpenses(st) : 0),
      0,
    );

    let monthlyCashflow = computeMonthlyCashflow(states, month);
    const capexDeduction = computeCapexDeduction(states, month) + eventCapexSpike;
    monthlyCashflow -= capexDeduction;

    if (monthlyCashflow > 0) {
      cumulativeCashflow += monthlyCashflow;
    }

    const surplus = monthlyCashflow - monthlyReserveTarget;
    if (surplus > 0) {
      if (reinvestSurplus) {
        const balancesBeforeReinvest = new Map(states.map((s) => [s.name, s.balance]));
        const currentTarget = findTarget(payoffOrder, states, month);
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
        refinancedThisMonth,
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
  if (remaining && !options.allowIncomplete && !options.allowUnresolved) {
    throw new Error(
      `Simulation did not converge within ${maxMonths} months`,
    );
  }

  const finalMonthlyCashflow = states.reduce((sum, s) => {
    if (!isPropertyOwned(s, lastSimMonth)) return sum;
    const capex = propertyMonthlyCapex(
      s.grossMonthlyRent,
      s.capexReserveRate,
      s.capexReserveFlat,
    );
    return sum + (s.monthlyRent - stateTotalExpenses(s) - capex);
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
    refinanceSchedule,
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

/** Apply a scenario: returns properties to simulate and optional lump-sum from sale. */
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

/** Simulation month at the start of a 1-based portfolio year. */
export function monthForPortfolioYear(year: number): number {
  return Math.max(1, (year - 1) * 12 + 1);
}

export function maxPortfolioDashboardYear(result: SimulationResult): number {
  return Math.max(1, Math.min(20, Math.ceil(result.monthsToPayoff / 12)));
}

/** Portfolio KPIs at the start of a given year (year 1 = current / anchor year). */
export function computePortfolioYearMetrics(
  portfolio: Portfolio,
  result: SimulationResult,
  year: number,
): PortfolioYearMetrics | null {
  const month = monthForPortfolioYear(year);
  const snap = snapshotAtMonth(result, month);
  if (!snap) return null;

  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const owned = portfolio.properties.filter((p) => (p.closeMonth ?? 1) <= month);
  const cashInvested = owned.reduce((s, p) => s + resolveCashInvested(p), 0);

  const rentMonthly = snap.monthlyRent;
  const opexMonthly = snap.monthlyExpenses;
  const noiAnnual = (rentMonthly - opexMonthly) * 12;
  const debtServiceAnnual = snap.monthlyPi * 12;
  const capexAnnual = snap.monthlyCapex * 12;
  const cashflowAnnual = snap.monthlyCashflow * 12;
  const propertyValue = snap.totalPropertyValue;
  const debt = snap.totalLiabilities;
  const equity = snap.totalEquity;
  const ltv = propertyValue > 0 ? debt / propertyValue : 0;
  const capRate = propertyValue > 0 ? noiAnnual / propertyValue : 0;
  const portfolioDscr =
    debtServiceAnnual > 0 ? noiAnnual / debtServiceAnnual : null;
  const cashOnCash = cashInvested > 0 ? cashflowAnnual / cashInvested : null;

  return {
    year,
    calendarYear: anchorYear + year - 1,
    month,
    ownedCount: owned.length,
    rentMonthly,
    noiAnnual,
    debtServiceAnnual,
    capexAnnual,
    cashflowAnnual,
    cashInvested,
    cashOnCash,
    capRate,
    portfolioDscr,
    equity,
    propertyValue,
    debt,
    ltv,
  };
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

/** Gross rent after property events through asOfMonth (no growth). */
export function propertyGrossRentAtMonth(p: Property, asOfMonth: number): number {
  let rent = p.monthlyRent;
  for (const ev of p.events ?? []) {
    if (ev.month <= asOfMonth && ev.type === 'rentChange' && ev.rent != null) {
      rent = ev.rent;
    }
  }
  return rent;
}

/** Scale rent/expenses for months owned through asOfMonth. */
export function propertyGrownRentAtMonth(
  p: Property,
  portfolio: Portfolio,
  asOfMonth: number,
): number {
  const closeMonth = p.closeMonth ?? 1;
  if (asOfMonth < closeMonth) return 0;
  const monthsOwned = asOfMonth - closeMonth;
  const rentGrowth = p.annualRentGrowthRate ?? portfolio.annualRentGrowthRate;
  const baseRent = propertyGrossRentAtMonth(p, asOfMonth);
  return baseRent * Math.pow(1 + rentGrowth, monthsOwned / 12);
}

export function propertyGrownOperatingAtMonth(
  p: Property,
  portfolio: Portfolio,
  asOfMonth: number,
): number {
  const closeMonth = p.closeMonth ?? 1;
  if (asOfMonth < closeMonth) return 0;
  const monthsOwned = asOfMonth - closeMonth;
  const expenseInflation =
    p.annualExpenseInflationRate ?? portfolio.annualExpenseInflationRate;
  const operating = resolveMonthlyExpenses(p);
  return operating * Math.pow(1 + expenseInflation, monthsOwned / 12);
}

export function isPropertyActiveAtMonth(p: Property, asOfMonth: number): boolean {
  return (p.closeMonth ?? 1) <= asOfMonth;
}

/** Per-property metrics aligned with portfolio year dashboard (sim snapshot + schedule). */
export function computePropertyInsightsAtMonth(
  portfolio: Portfolio,
  result: SimulationResult,
  asOfMonth: number,
  scenario?: ScenarioConfig | null,
): PropertyInsight[] {
  const snap = snapshotAtMonth(result, asOfMonth);
  const payoffOrder = result.order;

  return portfolio.properties
    .filter((p) => isPropertyActiveAtMonth(p, asOfMonth))
    .map((p) => {
      const balance = snap?.balancesByName[p.name] ?? p.balance;
      const marketValue = snap?.valuesByName[p.name] ?? p.marketValue;
      const equity = snap?.equityByName[p.name] ?? marketValue - balance;
      const ltv = marketValue > 0 ? balance / marketValue : 0;
      const vacancy = resolveVacancyRate(p, portfolio, scenario);
      const grossRent = propertyGrownRentAtMonth(p, portfolio, asOfMonth);
      const effectiveRent = grossRent * (1 - vacancy);
      const operating = propertyGrownOperatingAtMonth(p, portfolio, asOfMonth);
      const netRent =
        effectiveRent - totalMonthlyExpenses(grossRent, operating, p.utilitiesRentRate);
      const capexRate = resolveCapexRate(p, portfolio, scenario);
      const capexFlat = p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat;
      const monthlyCapexReserve = propertyMonthlyCapex(grossRent, capexRate, capexFlat);
      const capRate = marketValue > 0 ? (netRent * 12) / marketValue : 0;
      const rankIdx = payoffOrder.indexOf(p.name);
      const noi =
        (effectiveRent - totalMonthlyExpenses(grossRent, operating, p.utilitiesRentRate)) *
        12;
      const refiMonth = result.refinanceSchedule[p.name];
      const monthlyPayment =
        refiMonth != null && asOfMonth >= refiMonth
          ? paymentFromPrincipal(
              balance,
              p.balloonRefiAnnualRate ?? portfolio.defaultRefiAnnualRate,
              p.balloonRefiTermMonths ?? portfolio.defaultRefiTermMonths,
            )
          : p.monthlyPayment;
      const debtService = monthlyPayment * 12;
      const dscr = debtService > 0 && balance > 0 ? noi / debtService : Infinity;
      const cashInvested = resolveCashInvested(p);
      const annualCf =
        (netRent - (balance > 0 ? monthlyPayment : 0) - monthlyCapexReserve) * 12;
      const cashOnCash = cashInvested > 0 ? annualCf / cashInvested : 0;
      const breakEvenOccupancy =
        grossRent > 0
          ? (totalMonthlyExpenses(grossRent, operating, p.utilitiesRentRate) +
              (balance > 0 ? p.monthlyPayment : 0) +
              monthlyCapexReserve) /
            grossRent
          : 0;
      const monthlyInterest = balance * (p.annualInterestRate / 12);
      const interestToIncomeRatio = netRent > 0 ? monthlyInterest / netRent : 0;
      const { warnings } = validateProperty(
        {
          ...p,
          balance,
          marketValue,
          monthlyRent: grossRent,
          monthlyExpenses: operating,
          monthlyPayment,
        },
        portfolio,
        scenario,
      );

      return {
        name: p.name,
        marketValue,
        balance,
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
    const operating = resolveMonthlyExpenses(p);
    const netRent =
      effectiveRent - totalMonthlyExpenses(p.monthlyRent, operating, p.utilitiesRentRate);
    const capexRate = resolveCapexRate(p, portfolio, scenario);
    const capexFlat = p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat;
    const monthlyCapexReserve = propertyMonthlyCapex(p.monthlyRent, capexRate, capexFlat);
    const capRate = p.marketValue > 0 ? (netRent * 12) / p.marketValue : 0;
    const rankIdx = payoffOrder.indexOf(p.name);
    const noi = (effectiveRent - totalMonthlyExpenses(p.monthlyRent, operating, p.utilitiesRentRate)) * 12;
    const debtService = p.monthlyPayment * 12;
    const dscr = debtService > 0 && p.balance > 0 ? noi / debtService : Infinity;
    const cashInvested = resolveCashInvested(p);
    const annualCf =
      (netRent - (p.balance > 0 ? p.monthlyPayment : 0) - monthlyCapexReserve) * 12;
    const cashOnCash = cashInvested > 0 ? annualCf / cashInvested : 0;
    const grossRent = p.monthlyRent;
    const breakEvenOccupancy =
      grossRent > 0
        ? (totalMonthlyExpenses(p.monthlyRent, operating, p.utilitiesRentRate) +
            (p.balance > 0 ? p.monthlyPayment : 0) +
            monthlyCapexReserve) /
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
      `Portfolio LTV is ${(metrics.ltv * 100).toFixed(0)}% ????? equity builds as balances pay down and values appreciate.`,
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

/** Resolve close/refi calendar fields from portfolio JSON into simulation months. */
export function resolvePropertySchedule(
  raw: Record<string, unknown>,
  anchorYear: number,
  anchorMonth: number,
  defaults: { refiRate: number; refiTermMonths: number },
): {
  financingType?: 'conventional' | 'seller';
  closeMonth: number;
  closeYear?: number;
  closeMonthCalendar?: number;
  balloonMonths?: number;
  sellerAmortizationMonths?: number;
  refiYear?: number;
  refiMonthCalendar?: number;
  refiSimMonth?: number;
  balloonRefiAnnualRate?: number;
  balloonRefiTermMonths?: number;
} {
  const financingType =
    raw.financing_type === 'seller'
      ? 'seller'
      : raw.financing_type === 'conventional'
        ? 'conventional'
        : undefined;

  let closeMonth = 1;
  let closeYear: number | undefined;
  let closeMonthCalendar: number | undefined;

  if (typeof raw.close_month === 'number') {
    closeMonth = raw.close_month;
  } else if (typeof raw.close_year === 'number') {
    closeYear = raw.close_year;
    closeMonthCalendar =
      typeof raw.close_month_calendar === 'number' ? raw.close_month_calendar : 1;
    closeMonth = calendarToSimMonth(
      closeYear,
      closeMonthCalendar,
      anchorYear,
      anchorMonth,
    );
  }

  const balloonMonths =
    typeof raw.balloon_months === 'number' ? raw.balloon_months : undefined;
  const sellerAmortizationMonths =
    typeof raw.seller_amortization_months === 'number'
      ? raw.seller_amortization_months
      : undefined;

  let refiYear: number | undefined;
  let refiMonthCalendar: number | undefined;
  let refiSimMonth: number | undefined;

  if (typeof raw.refi_year === 'number') {
    refiYear = raw.refi_year;
    refiMonthCalendar = typeof raw.refi_month === 'number' ? raw.refi_month : 1;
    refiSimMonth = calendarToSimMonth(
      refiYear,
      refiMonthCalendar,
      anchorYear,
      anchorMonth,
    );
  } else if (balloonMonths != null) {
    refiSimMonth = closeMonth + balloonMonths;
  }

  const isSeller =
    financingType === 'seller' || (balloonMonths != null && raw.annual_interest_rate === 0);

  const refiRate =
    typeof raw.refi_annual_rate === 'number'
      ? raw.refi_annual_rate
      : typeof raw.balloon_refi_annual_rate === 'number'
        ? raw.balloon_refi_annual_rate
        : isSeller
          ? defaults.refiRate
          : undefined;

  const refiTermMonths =
    typeof raw.refi_term_months === 'number'
      ? raw.refi_term_months
      : typeof raw.balloon_refi_term_months === 'number'
        ? raw.balloon_refi_term_months
        : isSeller
          ? defaults.refiTermMonths
          : undefined;

  return {
    financingType:
      financingType ?? (balloonMonths != null ? 'seller' : undefined),
    closeMonth,
    closeYear,
    closeMonthCalendar,
    balloonMonths,
    sellerAmortizationMonths,
    refiYear,
    refiMonthCalendar,
    refiSimMonth: isSeller || balloonMonths != null ? refiSimMonth : undefined,
    balloonRefiAnnualRate: refiRate,
    balloonRefiTermMonths: refiTermMonths,
  };
}

const DESOTO_EXPENSE_DEFAULTS = {
  propertyTaxRate: 0.02,
  annualInsurance: 3100,
};

/** DeSoto portfolio properties share 2% tax and $3,100/yr insurance. */
export function isDesotoProperty(name: string): boolean {
  return (
    /desoto/i.test(name) ||
    /shadybrook|larchbrook|idlecreek|summit dr|deborah dr/i.test(name)
  );
}

function applyDesotoPortfolioDefaults(portfolio: Portfolio): Portfolio {
  const properties = portfolio.properties.map((p) => {
    if (!isDesotoProperty(p.name)) return p;
    const purchasePrice = p.purchasePrice ?? p.marketValue;
    const next: Property = {
      ...p,
      purchasePrice,
      propertyTaxRate:
        p.propertyTaxRate ?? DESOTO_EXPENSE_DEFAULTS.propertyTaxRate,
      annualInsurance:
        p.annualInsurance ?? DESOTO_EXPENSE_DEFAULTS.annualInsurance,
    };
    return {
      ...next,
      monthlyExpenses: resolveMonthlyExpenses(next),
    };
  });
  return { ...portfolio, properties };
}

/** Normalize raw JSON into a Portfolio (exported for tests and hook). */
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

function applyOptionalPropertyFields(prop: Property, p: Record<string, unknown>): void {
  const optionalNums: [keyof Property, string][] = [
    ['vacancyRate', 'vacancy_rate'],
    ['capexReserveRate', 'capex_reserve_rate'],
    ['capexReserveFlat', 'capex_reserve_flat'],
    ['cashInvested', 'cash_invested'],
    ['originalLoanAmount', 'original_loan_amount'],
    ['remainingTermMonths', 'remaining_term_months'],
    ['purchasePrice', 'purchase_price'],
    ['propertyTaxRate', 'property_tax_rate'],
    ['annualInsurance', 'annual_insurance'],
    ['landPercent', 'land_percent'],
    ['placedInServiceYear', 'placed_in_service_year'],
    ['costSegPercent', 'cost_seg_percent'],
    ['bonusEligiblePercent', 'bonus_eligible_percent'],
    ['sellerPayoffCap', 'seller_payoff_cap'],
    ['sellerCredit', 'seller_credit'],
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
}

export function normalizePortfolio(raw: unknown): Portfolio {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid portfolio: expected an object');
  }
  const obj = raw as Record<string, unknown>;
  const seedVersion =
    typeof obj.seed_version === 'number' ? obj.seed_version : undefined;
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
  const simulationAnchorYear =
    typeof obj.simulation_anchor_year === 'number'
      ? obj.simulation_anchor_year
      : 2026;
  const simulationAnchorMonth =
    typeof obj.simulation_anchor_month === 'number'
      ? obj.simulation_anchor_month
      : 1;
  const portfolioDefaults = {
    refiRate:
      typeof obj.default_refi_annual_rate === 'number'
        ? obj.default_refi_annual_rate
        : typeof obj.balloon_refi_annual_rate === 'number'
          ? obj.balloon_refi_annual_rate
          : DEFAULT_BALLOON_REFI_RATE,
    refiTermMonths:
      typeof obj.default_refi_term_months === 'number'
        ? obj.default_refi_term_months
        : typeof obj.balloon_refi_term_months === 'number'
          ? obj.balloon_refi_term_months
          : DEFAULT_BALLOON_REFI_TERM_MONTHS,
  };

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

    const schedule = resolvePropertySchedule(
      p,
      simulationAnchorYear,
      simulationAnchorMonth,
      portfolioDefaults,
    );
    prop.closeMonth = schedule.closeMonth;
    if (schedule.closeYear !== undefined) prop.closeYear = schedule.closeYear;
    if (schedule.closeMonthCalendar !== undefined) {
      prop.closeMonthCalendar = schedule.closeMonthCalendar;
    }
    if (schedule.financingType !== undefined) {
      prop.financingType = schedule.financingType;
    }
    if (schedule.balloonMonths !== undefined) {
      prop.balloonMonths = schedule.balloonMonths;
    }
    if (schedule.sellerAmortizationMonths !== undefined) {
      prop.sellerAmortizationMonths = schedule.sellerAmortizationMonths;
    }
    if (schedule.refiYear !== undefined) prop.refiYear = schedule.refiYear;
    if (schedule.refiMonthCalendar !== undefined) {
      prop.refiMonthCalendar = schedule.refiMonthCalendar;
    }
    if (schedule.refiSimMonth !== undefined) prop.refiSimMonth = schedule.refiSimMonth;
    if (schedule.balloonRefiAnnualRate !== undefined) {
      prop.balloonRefiAnnualRate = schedule.balloonRefiAnnualRate;
    }
    if (schedule.balloonRefiTermMonths !== undefined) {
      prop.balloonRefiTermMonths = schedule.balloonRefiTermMonths;
    }

    if (typeof p.utilities_rent_rate === 'number') {
      prop.utilitiesRentRate = p.utilities_rent_rate;
    }

    applyOptionalPropertyFields(prop, p);

    return prop;
  });

  const partialPortfolio: Portfolio = {
    seedVersion,
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
    simulationAnchorYear,
    simulationAnchorMonth,
    defaultRefiAnnualRate: portfolioDefaults.refiRate,
    defaultRefiTermMonths: portfolioDefaults.refiTermMonths,
    properties,
  };

  partialPortfolio.acquisitionTemplate = normalizeAcquisitionTemplate(
    obj.acquisition_template as Parameters<typeof normalizeAcquisitionTemplate>[0],
    partialPortfolio,
  );

  return applyDesotoPortfolioDefaults(partialPortfolio);
}

/** Convert Portfolio back to snake_case JSON shape. */
export function denormalizePortfolio(
  portfolio: Portfolio,
): import('./types').PortfolioFile {
  return {
    seed_version: portfolio.seedVersion,
    extra_monthly_budget: portfolio.extraMonthlyBudget,
    simulation_anchor_year: portfolio.simulationAnchorYear,
    simulation_anchor_month: portfolio.simulationAnchorMonth,
    default_refi_annual_rate: portfolio.defaultRefiAnnualRate,
    default_refi_term_months: portfolio.defaultRefiTermMonths,
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
      if (p.financingType !== undefined) {
        file.financing_type = p.financingType;
      }
      if (p.closeYear !== undefined) {
        file.close_year = p.closeYear;
        if (p.closeMonthCalendar !== undefined && p.closeMonthCalendar !== 1) {
          file.close_month_calendar = p.closeMonthCalendar;
        }
      } else if (p.closeMonth !== undefined && p.closeMonth > 1) {
        file.close_month = p.closeMonth;
      }
      if (p.balloonMonths !== undefined) {
        file.balloon_months = p.balloonMonths;
      }
      if (p.sellerAmortizationMonths !== undefined) {
        file.seller_amortization_months = p.sellerAmortizationMonths;
      }
      if (p.refiYear !== undefined) {
        file.refi_year = p.refiYear;
        if (p.refiMonthCalendar !== undefined && p.refiMonthCalendar !== 1) {
          file.refi_month = p.refiMonthCalendar;
        }
      }
      if (p.balloonRefiAnnualRate !== undefined) {
        file.refi_annual_rate = p.balloonRefiAnnualRate;
      }
      if (p.balloonRefiTermMonths !== undefined) {
        file.refi_term_months = p.balloonRefiTermMonths;
      }
      if (p.sellerPayoffCap !== undefined) {
        file.seller_payoff_cap = p.sellerPayoffCap;
      }
      if (p.sellerCredit !== undefined) {
        file.seller_credit = p.sellerCredit;
      }
      if (p.utilitiesRentRate !== undefined) {
        file.utilities_rent_rate = p.utilitiesRentRate;
      }
      if (p.vacancyRate !== undefined) file.vacancy_rate = p.vacancyRate;
      if (p.capexReserveRate !== undefined) file.capex_reserve_rate = p.capexReserveRate;
      if (p.capexReserveFlat !== undefined) file.capex_reserve_flat = p.capexReserveFlat;
      if (p.cashInvested !== undefined) file.cash_invested = p.cashInvested;
      if (p.originalLoanAmount !== undefined) file.original_loan_amount = p.originalLoanAmount;
      if (p.remainingTermMonths !== undefined) file.remaining_term_months = p.remainingTermMonths;
      if (p.purchasePrice !== undefined) file.purchase_price = p.purchasePrice;
      if (p.propertyTaxRate !== undefined) file.property_tax_rate = p.propertyTaxRate;
      if (p.annualInsurance !== undefined) file.annual_insurance = p.annualInsurance;
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
  shadybrookSeller:
    '144/146 Shadybrook Dr (seller 6%, 5yr balloon)',
  lisaLn: 'Lisa Ln (Cedar Hill)',
} as const;
