import { describe, expect, it } from 'vitest';
import type { Property } from './types';
import {
  amortizeOneMonth,
  compareStrategies,
  normalizePortfolio,
  SEED_PROPERTY_NAMES,
  simulateSnowball,
  STRATEGIES,
} from './snowball';

const fixture: Property[] = [
  {
    name: 'HighRate',
    balance: 100000,
    annualInterestRate: 0.08,
    monthlyPayment: 800,
    monthlyRent: 1500,
    monthlyExpenses: 450,
  },
  {
    name: 'LowRate',
    balance: 50000,
    annualInterestRate: 0.03,
    monthlyPayment: 400,
    monthlyRent: 900,
    monthlyExpenses: 270,
  },
  {
    name: 'Small',
    balance: 10000,
    annualInterestRate: 0.05,
    monthlyPayment: 200,
    monthlyRent: 600,
    monthlyExpenses: 180,
  },
];

describe('amortizeOneMonth', () => {
  it('amortizes a normal month', () => {
    const r = amortizeOneMonth({
      balance: 100000,
      annualInterestRate: 0.06,
      scheduledPayment: 600,
      extraPayment: 0,
    });
    expect(r.interestPaid).toBeCloseTo(500, 2);
    expect(r.principalPaid).toBeCloseTo(100, 2);
    expect(r.balance).toBeCloseTo(99900, 2);
    expect(r.paidOff).toBe(false);
  });

  it('applies extra payment to principal', () => {
    const r = amortizeOneMonth({
      balance: 100000,
      annualInterestRate: 0.06,
      scheduledPayment: 600,
      extraPayment: 500,
    });
    expect(r.extraApplied).toBe(500);
    expect(r.principalPaid).toBeCloseTo(600, 2);
    expect(r.balance).toBeCloseTo(99400, 2);
  });

  it('handles zero balance', () => {
    const r = amortizeOneMonth({
      balance: 0,
      annualInterestRate: 0.06,
      scheduledPayment: 600,
      extraPayment: 100,
    });
    expect(r.balance).toBe(0);
    expect(r.interestPaid).toBe(0);
    expect(r.paidOff).toBe(true);
  });

  it('caps final scheduled payment at remaining balance', () => {
    const r = amortizeOneMonth({
      balance: 100,
      annualInterestRate: 0.06,
      scheduledPayment: 600,
      extraPayment: 0,
    });
    expect(r.balance).toBe(0);
    expect(r.paidOff).toBe(true);
  });

  it('caps extra at remaining balance after scheduled', () => {
    const r = amortizeOneMonth({
      balance: 500,
      annualInterestRate: 0.06,
      scheduledPayment: 200,
      extraPayment: 10000,
    });
    expect(r.balance).toBe(0);
    expect(r.extraApplied).toBeLessThan(10000);
    expect(r.paidOff).toBe(true);
  });

  it('handles zero interest rate', () => {
    const r = amortizeOneMonth({
      balance: 10000,
      annualInterestRate: 0,
      scheduledPayment: 500,
      extraPayment: 0,
    });
    expect(r.interestPaid).toBe(0);
    expect(r.principalPaid).toBe(500);
    expect(r.balance).toBe(9500);
  });

  it('throws on negative balance', () => {
    expect(() =>
      amortizeOneMonth({
        balance: -1,
        annualInterestRate: 0.05,
        scheduledPayment: 100,
        extraPayment: 0,
      }),
    ).toThrow(/Negative input/);
  });

  it('throws on negative rate', () => {
    expect(() =>
      amortizeOneMonth({
        balance: 1000,
        annualInterestRate: -0.01,
        scheduledPayment: 100,
        extraPayment: 0,
      }),
    ).toThrow(/Negative input/);
  });

  it('throws on negative scheduled payment', () => {
    expect(() =>
      amortizeOneMonth({
        balance: 1000,
        annualInterestRate: 0.05,
        scheduledPayment: -1,
        extraPayment: 0,
      }),
    ).toThrow(/Negative input/);
  });

  it('throws on negative extra payment', () => {
    expect(() =>
      amortizeOneMonth({
        balance: 1000,
        annualInterestRate: 0.05,
        scheduledPayment: 100,
        extraPayment: -1,
      }),
    ).toThrow(/Negative input/);
  });

  it('throws when payment does not cover interest', () => {
    expect(() =>
      amortizeOneMonth({
        balance: 100000,
        annualInterestRate: 0.12,
        scheduledPayment: 100,
        extraPayment: 0,
        propertyName: 'TestProp',
      }),
    ).toThrow(/does not cover interest.*TestProp/);
  });
});

describe('simulateSnowball', () => {
  const single: Property[] = [
    {
      name: 'Only',
      balance: 12000,
      annualInterestRate: 0,
      monthlyPayment: 1000,
      monthlyRent: 2000,
      monthlyExpenses: 600,
    },
  ];

  it('pays off a single property', () => {
    const r = simulateSnowball(single, {
      payoffOrder: ['Only'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
    });
    expect(r.monthsToPayoff).toBe(12);
    expect(r.payoffSchedule.Only).toBe(12);
  });

  it('extra speeds payoff and lowers interest', () => {
    const noExtra = simulateSnowball(single, {
      payoffOrder: ['Only'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
    });
    const withExtra = simulateSnowball(single, {
      payoffOrder: ['Only'],
      extraMonthlyBudget: 500,
      snowballCashflow: false,
    });
    expect(withExtra.monthsToPayoff).toBeLessThan(noExtra.monthsToPayoff);
    expect(withExtra.totalInterestPaid).toBeLessThanOrEqual(
      noExtra.totalInterestPaid,
    );
  });

  it('does not mutate input properties', () => {
    const props = structuredClone(fixture);
    const before = JSON.stringify(props);
    simulateSnowball(props, {
      payoffOrder: ['HighRate', 'LowRate', 'Small'],
      extraMonthlyBudget: 1000,
    });
    expect(JSON.stringify(props)).toBe(before);
  });

  it('snowball rollover speeds total payoff', () => {
    const two: Property[] = [
      { ...single[0], name: 'A', balance: 5000 },
      { ...single[0], name: 'B', balance: 5000 },
    ];
    const noSnowball = simulateSnowball(two, {
      payoffOrder: ['A', 'B'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
    });
    const withSnowball = simulateSnowball(two, {
      payoffOrder: ['A', 'B'],
      extraMonthlyBudget: 0,
      snowballCashflow: true,
    });
    expect(withSnowball.monthsToPayoff).toBeLessThanOrEqual(
      noSnowball.monthsToPayoff,
    );
  });

  it('respects payoff order for targeting', () => {
    const r = simulateSnowball(fixture, {
      payoffOrder: ['Small', 'HighRate', 'LowRate'],
      extraMonthlyBudget: 5000,
    });
    expect(r.payoffSchedule.Small).toBeLessThan(r.payoffSchedule.HighRate);
  });

  it('history length matches months to payoff', () => {
    const r = simulateSnowball(fixture, {
      payoffOrder: STRATEGIES.highestRate(fixture),
      extraMonthlyBudget: 2000,
    });
    expect(r.history.length).toBe(r.monthsToPayoff);
  });

  it('totals match summed history', () => {
    const r = simulateSnowball(fixture, {
      payoffOrder: STRATEGIES.lowestBalance(fixture),
      extraMonthlyBudget: 1000,
    });
    const sumInterest = r.history.reduce(
      (s, h) => s + h.totalInterestThisMonth,
      0,
    );
    const sumExtra = r.history.reduce((s, h) => s + h.totalExtraApplied, 0);
    expect(sumInterest).toBeCloseTo(r.totalInterestPaid, 2);
    expect(sumExtra).toBeCloseTo(r.totalExtraPaid, 2);
  });

  it('throws on unknown property in payoff order', () => {
    expect(() =>
      simulateSnowball(fixture, { payoffOrder: ['Ghost', 'HighRate'] }),
    ).toThrow(/Unknown property/);
  });

  it('throws on duplicate property in payoff order', () => {
    expect(() =>
      simulateSnowball(fixture, {
        payoffOrder: ['HighRate', 'HighRate', 'LowRate'],
      }),
    ).toThrow(/Duplicate property/);
  });

  it('baseline applies no extra principal', () => {
    const r = simulateSnowball(fixture, {
      payoffOrder: fixture.map((p) => p.name),
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'baseline',
    });
    expect(r.totalExtraPaid).toBe(0);
  });

  it('throws on negative budget', () => {
    expect(() =>
      simulateSnowball(fixture, {
        payoffOrder: ['HighRate'],
        extraMonthlyBudget: -1,
      }),
    ).toThrow(/non-negative/);
  });

  it('throws when simulation does not converge', () => {
    expect(() =>
      simulateSnowball(fixture, {
        payoffOrder: STRATEGIES.highestRate(fixture),
        extraMonthlyBudget: 0,
        maxMonths: 2,
      }),
    ).toThrow(/did not converge/);
  });
});

describe('STRATEGIES ordering', () => {
  it('highestRate sorts by rate descending', () => {
    expect(STRATEGIES.highestRate(fixture)).toEqual([
      'HighRate',
      'Small',
      'LowRate',
    ]);
  });

  it('highestPiPerDollar sorts by payment/balance descending', () => {
    const order = STRATEGIES.highestPiPerDollar(fixture);
    expect(order[0]).toBe('Small');
  });

  it('highestCashflowBoost sorts by payment descending', () => {
    expect(STRATEGIES.highestCashflowBoost(fixture)).toEqual([
      'HighRate',
      'LowRate',
      'Small',
    ]);
  });

  it('lowestBalance sorts by balance ascending', () => {
    expect(STRATEGIES.lowestBalance(fixture)).toEqual([
      'Small',
      'LowRate',
      'HighRate',
    ]);
  });
});

describe('compareStrategies', () => {
  it('returns all strategies plus baseline', () => {
    const results = compareStrategies(fixture, { extraMonthlyBudget: 1000 });
    expect(results.length).toBe(5);
    expect(results.some((r) => r.strategy === 'baseline')).toBe(true);
  });

  it('sorts fastest first then least interest', () => {
    const results = compareStrategies(fixture, { extraMonthlyBudget: 2000 });
    for (let i = 1; i < results.length; i += 1) {
      const prev = results[i - 1];
      const curr = results[i];
      expect(prev.monthsToPayoff).toBeLessThanOrEqual(curr.monthsToPayoff);
      if (prev.monthsToPayoff === curr.monthsToPayoff) {
        expect(prev.totalInterestPaid).toBeLessThanOrEqual(
          curr.totalInterestPaid,
        );
      }
    }
  });

  it('baseline never beats extra-payment strategies on speed', () => {
    const results = compareStrategies(fixture, { extraMonthlyBudget: 1000 });
    const baseline = results.find((r) => r.strategy === 'baseline')!;
    const extras = results.filter((r) => r.strategy !== 'baseline');
    for (const r of extras) {
      expect(baseline.monthsToPayoff).toBeGreaterThanOrEqual(r.monthsToPayoff);
    }
  });

  it('can skip baseline', () => {
    const results = compareStrategies(fixture, {
      extraMonthlyBudget: 1000,
      includeBaseline: false,
    });
    expect(results.length).toBe(4);
    expect(results.every((r) => r.strategy !== 'baseline')).toBe(true);
  });
});

describe('normalizePortfolio', () => {
  it('normalizes snake_case JSON', () => {
    const p = normalizePortfolio({
      extra_monthly_budget: 5000,
      properties: [
        {
          name: 'Test',
          balance: 100,
          annual_interest_rate: 0.05,
          monthly_payment: 10,
          monthly_rent: 20,
          monthly_expenses: 6,
        },
      ],
    });
    expect(p.extraMonthlyBudget).toBe(5000);
    expect(p.properties[0].annualInterestRate).toBe(0.05);
  });
});

describe('seed portfolio integration', () => {
  const seed: Property[] = [
    {
      name: 'Lisa Ln (Cedar Hill)',
      balance: 200841.83,
      annualInterestRate: 0.0275,
      monthlyPayment: 939.67,
      monthlyRent: 3590,
      monthlyExpenses: 1077,
    },
    {
      name: 'Brookwood (Duncanville)',
      balance: 367904.27,
      annualInterestRate: 0.0425,
      monthlyPayment: 1936.67,
      monthlyRent: 6200,
      monthlyExpenses: 1860,
    },
    {
      name: 'Ridge Rock (Duncanville)',
      balance: 402799.55,
      annualInterestRate: 0.0655,
      monthlyPayment: 2595.45,
      monthlyRent: 5740,
      monthlyExpenses: 1722,
    },
    {
      name: 'Wendy (Irving)',
      balance: 409329.95,
      annualInterestRate: 0.06375,
      monthlyPayment: 2663.3,
      monthlyRent: 5470,
      monthlyExpenses: 1641,
    },
    {
      name: SEED_PROPERTY_NAMES.parkBlvd,
      balance: 468576.65,
      annualInterestRate: 0.06625,
      monthlyPayment: 3011.06,
      monthlyRent: 5800,
      monthlyExpenses: 1740,
    },
    {
      name: 'DeSoto Duplex A (financed)',
      balance: 270000,
      annualInterestRate: 0.06625,
      monthlyPayment: 1728.84,
      monthlyRent: 3600,
      monthlyExpenses: 1080,
    },
    {
      name: SEED_PROPERTY_NAMES.desotoB,
      balance: 440000,
      annualInterestRate: 0,
      monthlyPayment: 1833.33,
      monthlyRent: 3600,
      monthlyExpenses: 1080,
    },
  ];

  it('highest rate starts with Park Blvd and ends with DeSoto B', () => {
    const order = STRATEGIES.highestRate(seed);
    expect(order[0]).toBe(SEED_PROPERTY_NAMES.parkBlvd);
    expect(order[order.length - 1]).toBe(SEED_PROPERTY_NAMES.desotoB);
  });

  it('pays off portfolio in roughly 14-16 years at $5k extra', () => {
    const r = simulateSnowball(seed, {
      payoffOrder: STRATEGIES.highestRate(seed),
      extraMonthlyBudget: 5000,
      strategyName: 'highestRate',
    });
    expect(r.monthsToPayoff).toBeGreaterThanOrEqual(168);
    expect(r.monthsToPayoff).toBeLessThanOrEqual(192);
  });

  it('Lisa Ln and DeSoto B are last two paid off under highest rate', () => {
    const r = simulateSnowball(seed, {
      payoffOrder: STRATEGIES.highestRate(seed),
      extraMonthlyBudget: 5000,
      strategyName: 'highestRate',
    });
    const months = Object.entries(r.payoffSchedule).sort(
      (a, b) => b[1] - a[1],
    );
    const lastTwo = months.slice(0, 2).map(([name]) => name);
    expect(lastTwo).toContain(SEED_PROPERTY_NAMES.lisaLn);
    expect(lastTwo).toContain(SEED_PROPERTY_NAMES.desotoB);
  });

});
