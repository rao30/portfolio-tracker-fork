import type { MonthSnapshot, Property, SimulationResult } from './types';

const BALANCE_EPSILON = 0.01;

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

/** Apply extra principal after scheduled payment (no additional interest). */
function applyExtraPrincipal(balance: number, extra: number): number {
  if (balance <= BALANCE_EPSILON || extra <= 0) return balance;
  return Math.max(0, balance - Math.min(extra, balance));
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

/**
 * Net monthly cashflow: (rent − expenses − P&I) on financed properties,
 * (rent − expenses) on paid-off properties.
 */
function computeMonthlyCashflow(
  properties: Property[],
  balances: Map<string, number>,
): number {
  return properties.reduce((sum, p) => {
    const bal = balances.get(p.name) ?? 0;
    const netRent = p.monthlyRent - p.monthlyExpenses;
    if (bal <= BALANCE_EPSILON) return sum + netRent;
    return sum + (netRent - p.monthlyPayment);
  }, 0);
}

/**
 * Simulate aggressive snowball payoff until all loans are zero.
 * Does not mutate the input properties array.
 */
export function simulateSnowball(
  properties: Property[],
  options: {
    payoffOrder: string[];
    extraMonthlyBudget?: number;
    snowballCashflow?: boolean;
    maxMonths?: number;
    strategyName?: string;
  },
): SimulationResult {
  const extraMonthlyBudget = options.extraMonthlyBudget ?? 0;
  const snowballCashflow = options.snowballCashflow ?? true;
  const maxMonths = options.maxMonths ?? 600;
  const strategyName = options.strategyName ?? 'custom';

  if (extraMonthlyBudget < 0) {
    throw new Error('extraMonthlyBudget must be non-negative');
  }

  const propertyNames = new Set(properties.map((p) => p.name));
  validatePayoffOrder(options.payoffOrder, propertyNames);

  const balances = new Map<string, number>(
    properties.map((p) => [p.name, p.balance]),
  );
  const history: MonthSnapshot[] = [];
  const payoffSchedule: Record<string, number> = {};
  let totalInterestPaid = 0;
  let totalExtraPaid = 0;

  for (let month = 1; month <= maxMonths; month += 1) {
    const activeCount = [...balances.values()].filter(
      (b) => b > BALANCE_EPSILON,
    ).length;
    if (activeCount === 0) break;

    let extraPool = extraMonthlyBudget;
    if (snowballCashflow) {
      for (const p of properties) {
        const bal = balances.get(p.name) ?? 0;
        if (bal <= BALANCE_EPSILON) {
          extraPool += p.monthlyPayment;
        }
      }
    }

    const target =
      options.payoffOrder.find((name) => {
        const bal = balances.get(name) ?? 0;
        return bal > BALANCE_EPSILON;
      }) ?? null;

    let monthInterest = 0;
    let monthPrincipal = 0;
    let monthExtra = 0;
    const paidOffThisMonth: string[] = [];

    for (const p of properties) {
      const startBal = balances.get(p.name) ?? 0;
      if (startBal <= BALANCE_EPSILON) continue;

      const result = amortizeOneMonth({
        balance: startBal,
        annualInterestRate: p.annualInterestRate,
        scheduledPayment: p.monthlyPayment,
        extraPayment: 0,
        propertyName: p.name,
      });

      let newBal = result.balance;
      monthInterest += result.interestPaid;
      monthPrincipal += result.principalPaid;

      if (p.name === target && extraPool > 0) {
        const beforeExtra = newBal;
        newBal = applyExtraPrincipal(newBal, extraPool);
        const applied = beforeExtra - newBal;
        monthExtra += applied;
        monthPrincipal += applied;
        extraPool = 0;
      }

      balances.set(p.name, newBal);

      if (newBal <= BALANCE_EPSILON && startBal > BALANCE_EPSILON) {
        paidOffThisMonth.push(p.name);
        if (!(p.name in payoffSchedule)) {
          payoffSchedule[p.name] = month;
        }
      }
    }

    const monthlyCashflow = computeMonthlyCashflow(properties, balances);

    totalInterestPaid += monthInterest;
    totalExtraPaid += monthExtra;

    const balancesByName: Record<string, number> = {};
    let totalBalance = 0;
    for (const p of properties) {
      const bal = balances.get(p.name) ?? 0;
      balancesByName[p.name] = bal;
      totalBalance += bal;
    }

    history.push({
      month,
      totalBalance,
      totalInterestThisMonth: monthInterest,
      totalPrincipalThisMonth: monthPrincipal,
      totalExtraApplied: monthExtra,
      monthlyCashflow,
      targetProperty: target,
      paidOffThisMonth,
      balancesByName,
    });

    if (totalBalance <= BALANCE_EPSILON) break;
  }

  const remaining = [...balances.values()].some((b) => b > BALANCE_EPSILON);
  if (remaining) {
    throw new Error(
      `Simulation did not converge within ${maxMonths} months`,
    );
  }

  const finalMonthlyCashflow = properties.reduce(
    (sum, p) => sum + (p.monthlyRent - p.monthlyExpenses),
    0,
  );

  return {
    strategy: strategyName,
    order: options.payoffOrder,
    monthsToPayoff: history.length,
    totalInterestPaid,
    totalExtraPaid,
    finalMonthlyCashflow,
    payoffSchedule,
    history,
  };
}

/** Run all registered strategies (and optional baseline) and sort by speed. */
export function compareStrategies(
  properties: Property[],
  options?: { extraMonthlyBudget?: number; includeBaseline?: boolean },
): SimulationResult[] {
  const extraMonthlyBudget = options?.extraMonthlyBudget ?? 0;
  const includeBaseline = options?.includeBaseline ?? true;

  const results: SimulationResult[] = [];

  for (const [id, fn] of Object.entries(STRATEGIES)) {
    const payoffOrder = fn(properties);
    results.push(
      simulateSnowball(properties, {
        payoffOrder,
        extraMonthlyBudget,
        snowballCashflow: true,
        strategyName: id,
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

/** Normalize raw JSON into a Portfolio (exported for tests and hook). */
export function normalizePortfolio(raw: unknown): import('./types').Portfolio {
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

  const properties: Property[] = obj.properties.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid property at index ${i}`);
    }
    const p = item as Record<string, unknown>;
    const name = p.name;
    const balance = p.balance;
    const annualInterestRate = p.annual_interest_rate;
    const monthlyPayment = p.monthly_payment;
    const monthlyRent = p.monthly_rent;
    const monthlyExpenses = p.monthly_expenses;

    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`Property ${i}: invalid name`);
    }
    for (const [key, val] of [
      ['balance', balance],
      ['annual_interest_rate', annualInterestRate],
      ['monthly_payment', monthlyPayment],
      ['monthly_rent', monthlyRent],
      ['monthly_expenses', monthlyExpenses],
    ] as const) {
      if (typeof val !== 'number' || Number.isNaN(val)) {
        throw new Error(`Property "${name}": invalid ${key}`);
      }
    }

    return {
      name,
      balance: balance as number,
      annualInterestRate: annualInterestRate as number,
      monthlyPayment: monthlyPayment as number,
      monthlyRent: monthlyRent as number,
      monthlyExpenses: monthlyExpenses as number,
    };
  });

  return { extraMonthlyBudget, properties };
}

/** Convert Portfolio back to snake_case JSON shape. */
export function denormalizePortfolio(
  portfolio: import('./types').Portfolio,
): import('./types').PortfolioFile {
  return {
    extra_monthly_budget: portfolio.extraMonthlyBudget,
    properties: portfolio.properties.map((p) => ({
      name: p.name,
      balance: p.balance,
      annual_interest_rate: p.annualInterestRate,
      monthly_payment: p.monthlyPayment,
      monthly_rent: p.monthlyRent,
      monthly_expenses: p.monthlyExpenses,
    })),
  };
}

// Re-export portfolio for seed tests
export const SEED_PROPERTY_NAMES = {
  parkBlvd: 'Park Blvd (Plano, projected post-move-out)',
  desotoB: 'DeSoto Duplex B (0% seller-financed)',
  lisaLn: 'Lisa Ln (Cedar Hill)',
} as const;
