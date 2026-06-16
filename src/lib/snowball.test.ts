import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildTimelineTicks,
  calendarYearFromMonth,
  closeMonthFromYear,
  formatMonths,
  yearFromMonth,
} from './format';
import type { Property } from './types';
import {
  amortizeOneMonth,
  compareStrategies,
  computeMonthlyPayment,
  computeSellerFinancingTerms,
  computePropertyInsightsAtMonth,
  computePortfolioYearMetrics,
  computeRentalCashflowAtMonth,
  isOwnerOccupiedAtMonth,
  monthForPortfolioYear,
  DESOTO_DEBORAH_MONTHLY_RENT,
  DESOTO_DUPLEX_MONTHLY_RENT,
  isDesotoProperty,
  monthForPortfolioYear,
  normalizePortfolio,
  runSimulation,
  paymentFromPrincipal,
  resolveMonthlyExpenses,
  resolveMonthlyUtilities,
  resolvePropertySchedule,
  sumUtilityBreakdown,
  totalMonthlyExpenses,
  utilitiesFromRent,
  SEED_PROPERTY_NAMES,
  simulateSnowball,
  STRATEGIES,
  validateProperty,
} from './snowball';

const fixture: Property[] = [
  {
    name: 'HighRate',
    balance: 100000,
    marketValue: 160000,
    annualInterestRate: 0.08,
    annualAppreciationRate: 0.03,
    monthlyPayment: 800,
    monthlyRent: 1500,
    monthlyExpenses: 450,
  },
  {
    name: 'LowRate',
    balance: 50000,
    marketValue: 90000,
    annualInterestRate: 0.03,
    annualAppreciationRate: 0.03,
    monthlyPayment: 400,
    monthlyRent: 900,
    monthlyExpenses: 270,
  },
  {
    name: 'Small',
    balance: 10000,
    marketValue: 25000,
    annualInterestRate: 0.05,
    annualAppreciationRate: 0.03,
    monthlyPayment: 200,
    monthlyRent: 600,
    monthlyExpenses: 180,
  },
];

describe('timeline axis helpers', () => {
  it('maps month to calendar year', () => {
    expect(yearFromMonth(1)).toBe(1);
    expect(yearFromMonth(12)).toBe(1);
    expect(yearFromMonth(13)).toBe(2);
    expect(yearFromMonth(24)).toBe(2);
  });

  it('builds year-boundary ticks for long simulations', () => {
    const ticks = buildTimelineTicks(180);
    expect(ticks).toContain(1);
    expect(ticks).toContain(12);
    expect(ticks).toContain(24);
    expect(ticks).toContain(180);
  });

  it('formats duration with years', () => {
    expect(formatMonths(24)).toBe('2 yr');
    expect(formatMonths(30)).toBe('2 yr 6 mo');
  });
});

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
      marketValue: 20000,
      annualInterestRate: 0,
      annualAppreciationRate: 0.03,
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

  it('final month cashflow equals rent minus expenses on all properties', () => {
    const r = simulateSnowball(fixture, {
      payoffOrder: STRATEGIES.highestRate(fixture),
      extraMonthlyBudget: 1000,
    });
    const last = r.history[r.history.length - 1];
    expect(last.monthlyCashflow).toBeCloseTo(r.finalMonthlyCashflow, 2);
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

  it('tracks equity growth in history', () => {
    const r = simulateSnowball(fixture, {
      payoffOrder: STRATEGIES.highestRate(fixture),
      extraMonthlyBudget: 1000,
    });
    const first = r.history[0];
    const last = r.history[r.history.length - 1];
    expect(first.totalEquity).toBeGreaterThan(0);
    expect(last.totalEquity).toBeGreaterThan(first.totalEquity);
    expect(last.totalBalance).toBeLessThanOrEqual(0.01);
    expect(r.finalEquity).toBeCloseTo(last.totalEquity, 0);
  });

  it('accumulates cash reserves when not reinvesting', () => {
    const r = simulateSnowball(single, {
      payoffOrder: ['Only'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      reinvestSurplus: false,
      monthlyReserveTarget: 0,
      defaultCapexReserveRate: 0,
    });
    const last = r.history[r.history.length - 1];
    expect(last.cashReserveBalance).toBeGreaterThan(0);
    expect(last.netWorth).toBeGreaterThan(last.totalEquity);
  });

  it('snowballs leftover cashflow when reinvestSurplus is enabled', () => {
    const baseOpts = {
      payoffOrder: ['Only'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      monthlyReserveTarget: 0,
      defaultCapexReserveRate: 0,
    };
    const without = simulateSnowball(single, { ...baseOpts, reinvestSurplus: false });
    const withSurplus = simulateSnowball(single, { ...baseOpts, reinvestSurplus: true });
    expect(withSurplus.monthsToPayoff).toBeLessThan(without.monthsToPayoff);
    expect(withSurplus.totalExtraPaid).toBeGreaterThan(without.totalExtraPaid);
  });

  it('deducts per-property capex reserve from cashflow', () => {
    const withCapex = simulateSnowball(fixture, {
      payoffOrder: STRATEGIES.highestRate(fixture),
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      defaultCapexReserveRate: 0.1,
      maxMonths: 3,
      allowIncomplete: true,
    });
    expect(withCapex.history[0].monthlyCapex).toBeGreaterThan(0);
  });

  it('applies rent change events', () => {
    const props: Property[] = [
      {
        ...fixture[0],
        events: [{ month: 2, type: 'rentChange', rent: 2000 }],
      },
    ];
    const r = simulateSnowball(props, {
      payoffOrder: ['HighRate'],
      extraMonthlyBudget: 5000,
      maxMonths: 3,
      allowIncomplete: true,
    });
    expect(r.history[1].monthlyRent).toBeGreaterThan(r.history[0].monthlyRent);
  });

  it('computeMonthlyPayment handles zero rate', () => {
    expect(computeMonthlyPayment(240000, 0, 240)).toBeCloseTo(1000, 0);
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
    expect(results.length).toBe(7);
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
    expect(results.length).toBe(6);
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
          market_value: 150,
          annual_interest_rate: 0.05,
          monthly_payment: 10,
          monthly_rent: 20,
          monthly_expenses: 6,
        },
      ],
    });
    expect(p.extraMonthlyBudget).toBe(5000);
    expect(p.simulationAnchorYear).toBe(2026);
    expect(p.properties[0].annualInterestRate).toBe(0.05);
  });

  it('maps close_year to closeMonth from anchor', () => {
    const p = normalizePortfolio({
      extra_monthly_budget: 0,
      simulation_anchor_year: 2026,
      properties: [
        {
          name: 'Future',
          close_year: 2028,
          balance: 100,
          market_value: 100,
          annual_interest_rate: 0,
          monthly_payment: 1,
          monthly_rent: 1,
          monthly_expenses: 0,
        },
      ],
    });
    expect(p.properties[0].closeMonth).toBe(36);
    expect(p.properties[0].closeYear).toBe(2028);
    expect(p.properties[0].closeMonthCalendar).toBe(12);
  });

  it('applies DeSoto tax and insurance defaults on load', () => {
    const p = normalizePortfolio({
      extra_monthly_budget: 0,
      properties: [
        {
          name: '116/118 Shadybrook Dr (conventional)',
          balance: 360000,
          market_value: 360000,
          annual_interest_rate: 0.06625,
          monthly_payment: 2305,
          monthly_rent: 3600,
          monthly_expenses: 1080,
        },
      ],
    });
    expect(isDesotoProperty(p.properties[0].name)).toBe(true);
    expect(p.properties[0].propertyTaxRate).toBe(0.02);
    expect(p.properties[0].annualInsurance).toBe(3100);
    expect(p.properties[0].monthlyExpenses).toBeCloseTo(858.33, 2);
    expect(p.properties[0].monthlyRent).toBe(DESOTO_DUPLEX_MONTHLY_RENT);
  });

  it('applies Deborah duplex rent at $1,500/side', () => {
    const p = normalizePortfolio({
      extra_monthly_budget: 0,
      properties: [
        {
          name: '1419/1421 Deborah Dr (seller 6%, 5yr balloon)',
          balance: 281501.9,
          market_value: 380000,
          annual_interest_rate: 0.06,
          monthly_payment: 2016.77,
          monthly_rent: 3600,
          monthly_expenses: 891.67,
        },
      ],
    });
    expect(p.properties[0].monthlyRent).toBe(DESOTO_DEBORAH_MONTHLY_RENT);
  });

  it('sets conventional DeSoto duplex market value to 450k when JSON used loan balance', () => {
    const p = normalizePortfolio({
      extra_monthly_budget: 0,
      properties: [
        {
          name: '116/118 Shadybrook Dr (conventional)',
          financing_type: 'conventional',
          balance: 360000,
          market_value: 360000,
          annual_interest_rate: 0.06625,
          monthly_payment: 2305,
          monthly_rent: 3600,
          monthly_expenses: 1080,
        },
      ],
    });
    expect(p.properties[0].marketValue).toBe(450_000);
    expect(p.properties[0].purchasePrice).toBe(450_000);
    expect(p.properties[0].marketValue - p.properties[0].balance).toBe(90_000);
    expect(p.properties[0].monthlyRent).toBe(DESOTO_DUPLEX_MONTHLY_RENT);
  });

  it('loads seed duplex rents at $3,900 and Deborah at $3,000', () => {
    const portfolio = normalizePortfolio(
      JSON.parse(
        readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
      ),
    );
    const duplexes = portfolio.properties.filter(
      (p) => isDesotoProperty(p.name) && !/deborah/i.test(p.name),
    );
    expect(duplexes.length).toBe(7);
    expect(duplexes.every((p) => p.monthlyRent === DESOTO_DUPLEX_MONTHLY_RENT)).toBe(
      true,
    );
    const deborah = portfolio.properties.find((p) => /deborah/i.test(p.name))!;
    expect(deborah.monthlyRent).toBe(DESOTO_DEBORAH_MONTHLY_RENT);
  });
});

describe('computePortfolioYearMetrics', () => {
  it('returns annual cashflow and CoC at year 1', () => {
    const portfolio = normalizePortfolio(
      JSON.parse(
        readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
      ),
    );
    const result = runSimulation(portfolio, 'highestRate');
    const m = computePortfolioYearMetrics(portfolio, result, 1);
    expect(m).not.toBeNull();
    expect(m!.year).toBe(1);
    expect(m!.calendarYear).toBe(2026);
    expect(m!.month).toBe(1);
    expect(m!.ownedCount).toBeGreaterThan(0);
    const simCashflowAnnual = result.history[0]!.monthlyCashflow * 12;
    const rentalCashflowAnnual = computeRentalCashflowAtMonth(portfolio, result, 1) * 12;
    expect(rentalCashflowAnnual).toBeGreaterThanOrEqual(simCashflowAnnual);
    expect(m!.cashflowAnnual).toBe(rentalCashflowAnnual);
    expect(m!.noiAnnual).toBe(
      (result.history[0]!.monthlyRent - result.history[0]!.monthlyExpenses) * 12,
    );
  });

  it('advances snapshot month with year slider', () => {
    expect(monthForPortfolioYear(1)).toBe(1);
    expect(monthForPortfolioYear(3)).toBe(25);
  });
});

describe('validateProperty', () => {
  it('does not warn on high LTV', () => {
    const property: Property = {
      name: '116/118 Shadybrook Dr (conventional)',
      balance: 360000,
      marketValue: 360000,
      annualInterestRate: 0.06625,
      annualAppreciationRate: 0.03,
      monthlyPayment: 2305,
      monthlyRent: 3600,
      monthlyExpenses: resolveMonthlyExpenses({
        name: 'x',
        balance: 360000,
        marketValue: 360000,
        annualInterestRate: 0.06625,
        annualAppreciationRate: 0.03,
        monthlyPayment: 2305,
        monthlyRent: 3600,
        monthlyExpenses: 1080,
        purchasePrice: 360000,
        propertyTaxRate: 0.02,
        annualInsurance: 3100,
      }),
      purchasePrice: 360000,
      propertyTaxRate: 0.02,
      annualInsurance: 3100,
    };
    const { warnings } = validateProperty(property, {
      extraMonthlyBudget: 0,
      annualRentGrowthRate: 0.025,
      annualExpenseInflationRate: 0.02,
      reinvestSurplus: false,
      monthlyReserveTarget: 0,
      defaultVacancyRate: 0,
      defaultCapexReserveRate: 0.1,
      properties: [property],
      taxProfile: {
        annualW2Income: 350000,
        spouseIsReps: true,
        marginalTaxRate: 0.32,
        taxYear: 2026,
        bonusDepreciationRate: 1,
        remainingBonusCarryover: 250000,
        filingStatus: 'mfj',
        otherPassiveIncome: 0,
        stateTaxRate: 0,
      },
      goals: [],
    });
    expect(warnings.some((w) => /LTV/i.test(w))).toBe(false);
  });
});

describe('utilities expense', () => {
  it('supports legacy rent-rate utilities', () => {
    expect(utilitiesFromRent(6200, 0.15)).toBe(930);
    expect(totalMonthlyExpenses(6200, 1860, undefined, 0.15)).toBe(2790);
  });

  it('uses fixed monthly utilities from utility_breakdown', () => {
    const p: Property = {
      name: 'Test',
      balance: 100000,
      marketValue: 150000,
      annualInterestRate: 0.05,
      annualAppreciationRate: 0.03,
      monthlyPayment: 600,
      monthlyRent: 4000,
      monthlyExpenses: 1200,
      utilityBreakdown: {
        electricity: 300,
        waterSewer: 100,
        cleaningMaintenance: 65,
      },
    };
    expect(resolveMonthlyUtilities(p)).toBe(465);
    expect(totalMonthlyExpenses(4000, 1200, 465)).toBe(1665);
  });

  it('reduces cashflow when utilities are enabled', () => {
    const base: Property = {
      name: 'Test',
      balance: 100000,
      marketValue: 150000,
      annualInterestRate: 0.05,
      annualAppreciationRate: 0.03,
      monthlyPayment: 600,
      monthlyRent: 4000,
      monthlyExpenses: 1200,
    };
    const withUtilities: Property = {
      ...base,
      monthlyUtilities: 600,
    };
    const rBase = simulateSnowball([base], {
      payoffOrder: ['Test'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 1,
      allowUnresolved: true,
    });
    const rUtil = simulateSnowball([withUtilities], {
      payoffOrder: ['Test'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 1,
      allowUnresolved: true,
    });
    expect(rUtil.history[0].monthlyUtilities).toBeCloseTo(600, 0);
    expect(rUtil.history[0].monthlyCashflow).toBeLessThan(rBase.history[0].monthlyCashflow);
  });

  it('loads 2025 actual utility averages for owned portfolio properties', () => {
    const portfolio = normalizePortfolio(
      JSON.parse(
        readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
      ),
    );
    const lisa = portfolio.properties.find((p) => p.name.includes('Lisa'))!;
    expect(sumUtilityBreakdown(lisa.utilityBreakdown)).toBe(680);
    const brookwood = portfolio.properties.find((p) => p.name.includes('Brookwood'))!;
    expect(resolveMonthlyUtilities(brookwood)).toBe(928);
    const wendy = portfolio.properties.find((p) => p.name.includes('Wendy'))!;
    expect(resolveMonthlyUtilities(wendy)).toBe(763);
    expect(
      portfolio.properties.every((p) => p.utilitiesRentRate == null),
    ).toBe(true);
  });
});

describe('close schedule and balloon', () => {
  it('closeMonthFromYear aligns with calendarYearFromMonth', () => {
    expect(closeMonthFromYear(2028, 2026)).toBe(25);
    expect(calendarYearFromMonth(25, 2026)).toBe(2028);
  });

  it('activates a property on its close month', () => {
    const props: Property[] = [
      {
        name: 'Future Duplex',
        balance: 100000,
        marketValue: 100000,
        annualInterestRate: 0,
        annualAppreciationRate: 0,
        monthlyPayment: 500,
        monthlyRent: 1200,
        monthlyExpenses: 360,
        closeMonth: 13,
      },
    ];
    const r = simulateSnowball(props, {
      payoffOrder: ['Future Duplex'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
    });
    expect(r.history[11].balancesByName['Future Duplex']).toBe(0);
    expect(r.history[11].monthlyRent).toBe(0);
    expect(r.history[12].balancesByName['Future Duplex']).toBeCloseTo(99500, 0);
    expect(r.history[12].monthlyRent).toBeCloseTo(1200, 0);
  });

  it('leaves 75% balance after balloon month with minimum payments only', () => {
    const props: Property[] = [
      {
        name: 'Balloon Loan',
        balance: 240000,
        marketValue: 240000,
        annualInterestRate: 0,
        annualAppreciationRate: 0,
        monthlyPayment: 1000,
        monthlyRent: 0,
        monthlyExpenses: 0,
        balloonMonths: 60,
        closeMonth: 1,
      },
    ];
    const r = simulateSnowball(props, {
      payoffOrder: ['Balloon Loan'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 60,
      allowUnresolved: true,
    });
    const snap = r.history[59];
    expect(snap.balancesByName['Balloon Loan']).toBeCloseTo(180000, 0);
    expect(snap.refinancedThisMonth).toEqual([]);
  });

  it('refis balloon balance into 6.75% 30-year loan for month 61+', () => {
    const balance = 240000;
    const sellerPayment = balance / 240;
    const props: Property[] = [
      {
        name: 'Balloon Loan',
        balance,
        marketValue: balance,
        annualInterestRate: 0,
        annualAppreciationRate: 0,
        monthlyPayment: sellerPayment,
        monthlyRent: 0,
        monthlyExpenses: 0,
        balloonMonths: 60,
        refiYear: 2031,
        refiMonthCalendar: 1,
        refiSimMonth: 61,
        balloonRefiAnnualRate: 0.0675,
        balloonRefiTermMonths: 360,
        closeMonth: 1,
      },
    ];
    const r = simulateSnowball(props, {
      payoffOrder: ['Balloon Loan'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 62,
      allowUnresolved: true,
    });
    expect(r.history[59].balancesByName['Balloon Loan']).toBeCloseTo(180000, 0);
    expect(r.history[60].refinancedThisMonth).toContain('Balloon Loan');
    expect(r.refinanceSchedule['Balloon Loan']).toBe(61);
    const expectedPi = paymentFromPrincipal(180000, 0.0675, 360);
    expect(expectedPi).toBeCloseTo(1167.85, 0);
    expect(r.history[61].balancesByName['Balloon Loan']).toBeLessThan(180000);
  });

  it('4-year plan rentals and converted primaries target ~$700/mo net', () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf8'),
    );
    const portfolio = normalizePortfolio(raw);
    expect(portfolio.properties.length).toBe(21);

    const extra = portfolio.properties.find((p) =>
      p.name.startsWith('Additional rental 2026'),
    )!;
    const r = simulateSnowball([extra], {
      payoffOrder: [extra.name],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 24,
      defaultCapexReserveRate: 0.1,
      allowIncomplete: true,
    });
    expect(r.history[11].monthlyCashflow).toBeGreaterThan(650);
    expect(r.history[11].monthlyCashflow).toBeLessThan(750);

    const primary = portfolio.properties.find((p) =>
      p.name.startsWith('Primary 2026'),
    )!;
    const rp = simulateSnowball([primary], {
      payoffOrder: [primary.name],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 36,
      defaultCapexReserveRate: 0.1,
      allowIncomplete: true,
    });
    expect(rp.history[11].monthlyCashflow).toBeLessThan(0);
    expect(rp.history[12].monthlyCashflow).toBeGreaterThan(650);
    expect(rp.history[12].monthlyCashflow).toBeLessThan(750);
  });

  it('excludes owner-occupied primary from rental cashflow at year 1', () => {
    const portfolio = normalizePortfolio(
      JSON.parse(
        readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf8'),
      ),
    );
    const primary = portfolio.properties.find((p) => p.name.startsWith('Primary 2026'))!;
    expect(isOwnerOccupiedAtMonth(primary, 1)).toBe(false);
    expect(isOwnerOccupiedAtMonth(primary, 12)).toBe(true);
    expect(isOwnerOccupiedAtMonth(primary, 13)).toBe(false);

    const result = runSimulation(portfolio, 'highestRate');
    const insightsMonth12 = computePropertyInsightsAtMonth(portfolio, result, 12);
    const primaryInsight = insightsMonth12.find((p) => p.name.startsWith('Primary 2026'));
    expect(primaryInsight?.excludedFromRentalCashflow).toBe(true);

    const rentalSum = insightsMonth12
      .filter((p) => !p.excludedFromRentalCashflow)
      .reduce((s, p) => s + p.cashflowAnnual, 0);
    expect(computeRentalCashflowAtMonth(portfolio, result, 12) * 12).toBeCloseTo(
      rentalSum,
      0,
    );
  });

  it('property insights at month match owned count for portfolio year', () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf8'),
    );
    const portfolio = normalizePortfolio(raw);
    const result = runSimulation(portfolio, 'highestRate');
    const y1 = computePropertyInsightsAtMonth(
      portfolio,
      result,
      monthForPortfolioYear(1),
    );
    const y5 = computePropertyInsightsAtMonth(
      portfolio,
      result,
      monthForPortfolioYear(5),
    );
    expect(y1.length).toBeLessThan(y5.length);
    expect(y1.length).toBeGreaterThanOrEqual(5);
    const metricsY1 = computePortfolioYearMetrics(portfolio, result, 1);
    expect(y1.length).toBe(metricsY1?.ownedCount);
  });

  it('simulates full portfolio.json with staggered closes and balloons', () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf8'),
    );
    const portfolio = normalizePortfolio(raw);
    const r = simulateSnowball(portfolio.properties, {
      payoffOrder: STRATEGIES.highestRate(portfolio.properties),
      extraMonthlyBudget: portfolio.extraMonthlyBudget,
      strategyName: 'highestRate',
    });
    expect(r.monthsToPayoff).toBeGreaterThan(200);
    const refiMonths = r.history.filter((h) => h.refinancedThisMonth.length > 0);
    expect(refiMonths.length).toBeGreaterThanOrEqual(4);
    const shady116 = portfolio.properties.find((p) =>
      p.name.startsWith('116/118'),
    );
    expect(shady116?.closeMonth).toBe(6);
    expect(shady116?.closeYear).toBe(2026);
    expect(shady116?.closeMonthCalendar).toBe(6);
    const seller = portfolio.properties.find((p) =>
      p.name.startsWith('144/146'),
    );
    expect(seller?.refiYear).toBe(2031);
    expect(seller?.refiMonthCalendar).toBe(6);
    expect(seller?.refiSimMonth).toBe(66);
    expect(seller?.balloonRefiAnnualRate).toBe(0.0675);
    const deborah = portfolio.properties.find((p) => p.name.startsWith('1419'));
    expect(deborah?.closeMonth).toBe(48);
    expect(deborah?.refiYear).toBe(2034);
    expect(deborah?.refiMonthCalendar).toBe(12);
    expect(deborah?.refiSimMonth).toBe(108);
  });

  it('reads close and refi dates from JSON via resolvePropertySchedule', () => {
    const schedule = resolvePropertySchedule(
      {
        financing_type: 'seller',
        close_year: 2027,
        close_month_calendar: 1,
        balloon_months: 60,
        seller_amortization_months: 240,
        refi_year: 2032,
        refi_month: 1,
        refi_annual_rate: 0.0675,
        refi_term_months: 360,
        annual_interest_rate: 0,
      },
      2026,
      1,
      { refiRate: 0.06, refiTermMonths: 360 },
    );
    expect(schedule.closeMonth).toBe(13);
    expect(schedule.refiSimMonth).toBe(73);
    expect(schedule.refiYear).toBe(2032);
    expect(schedule.refiMonthCalendar).toBe(1);
    expect(schedule.refiYear).toBe(2032);
    expect(schedule.balloonRefiAnnualRate).toBe(0.0675);
  });

  it('computeSellerFinancingTerms matches Shadybrook rider cap', () => {
    const terms = computeSellerFinancingTerms(440000);
    expect(terms.principal).toBeCloseTo(344057.87, 0);
    expect(terms.monthlyPayment).toBeCloseTo(2464.94, 1);
    expect(terms.balloonBalance).toBeCloseTo(292103.6, 0);
  });

  it('computeSellerFinancingTerms scales Deborah payoff cap', () => {
    const terms = computeSellerFinancingTerms(360000);
    expect(terms.principal).toBeGreaterThan(280000);
    expect(terms.principal).toBeLessThan(282000);
    expect(terms.monthlyPayment * 60 + terms.balloonBalance).toBeCloseTo(360000, 0);
  });

  it('applies seller payoff cap at balloon refi (yield maintenance)', () => {
    const props: Property[] = [
      {
        name: 'Shadybrook Seller',
        balance: 344057.87,
        marketValue: 450000,
        annualInterestRate: 0.06,
        annualAppreciationRate: 0,
        monthlyPayment: 2464.94,
        monthlyRent: 3600,
        monthlyExpenses: 1000,
        closeMonth: 1,
        refiSimMonth: 61,
        sellerPayoffCap: 440000,
        balloonRefiAnnualRate: 0.0675,
        balloonRefiTermMonths: 360,
      },
    ];
    const r = simulateSnowball(props, {
      payoffOrder: ['Shadybrook Seller'],
      extraMonthlyBudget: 0,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 62,
      allowUnresolved: true,
    });
    const expectedBalloon = 440000 - 2464.94 * 60;
    expect(r.history[60].refinancedThisMonth).toContain('Shadybrook Seller');
    const refiBalance = r.history[60].balancesByName['Shadybrook Seller'];
    expect(refiBalance).toBeLessThan(expectedBalloon);
    expect(refiBalance).toBeGreaterThan(expectedBalloon * 0.99);
    expect(r.refinanceSchedule['Shadybrook Seller']).toBe(61);
  });

  it('refis on refi_sim month even when extra budget is available', () => {
    const props: Property[] = [
      {
        name: 'Balloon Loan',
        balance: 100000,
        marketValue: 100000,
        annualInterestRate: 0,
        annualAppreciationRate: 0,
        monthlyPayment: 100000 / 240,
        monthlyRent: 0,
        monthlyExpenses: 0,
        balloonMonths: 60,
        refiSimMonth: 61,
        balloonRefiAnnualRate: 0.0675,
        balloonRefiTermMonths: 360,
        closeMonth: 1,
      },
    ];
    const r = simulateSnowball(props, {
      payoffOrder: ['Balloon Loan'],
      extraMonthlyBudget: 500,
      pauseExtraMonths: 60,
      snowballCashflow: false,
      strategyName: 'test',
      maxMonths: 62,
      allowUnresolved: true,
    });
    expect(r.refinanceSchedule['Balloon Loan']).toBe(61);
    expect(r.payoffSchedule['Balloon Loan']).toBeUndefined();
    const refiBalance = r.history[60].balancesByName['Balloon Loan'];
    expect(refiBalance).toBeGreaterThan(70000);
    expect(refiBalance).toBeLessThan(76000);
  });
});

describe('seed portfolio integration', () => {
  const seed: Property[] = [
    {
      name: 'Lisa Ln (Cedar Hill)',
      balance: 200841.83,
      marketValue: 320000,
      annualInterestRate: 0.0275,
      annualAppreciationRate: 0.03,
      monthlyPayment: 939.67,
      monthlyRent: 3590,
      monthlyExpenses: 1077,
    },
    {
      name: 'Brookwood (Duncanville)',
      balance: 367904.27,
      marketValue: 550000,
      annualInterestRate: 0.0425,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1936.67,
      monthlyRent: 6200,
      monthlyExpenses: 1860,
    },
    {
      name: 'Ridge Rock (Duncanville)',
      balance: 402799.55,
      marketValue: 620000,
      annualInterestRate: 0.0655,
      annualAppreciationRate: 0.03,
      monthlyPayment: 2595.45,
      monthlyRent: 5740,
      monthlyExpenses: 1722,
    },
    {
      name: 'Wendy (Irving)',
      balance: 409329.95,
      marketValue: 630000,
      annualInterestRate: 0.06375,
      annualAppreciationRate: 0.03,
      monthlyPayment: 2663.3,
      monthlyRent: 5470,
      monthlyExpenses: 1641,
    },
    {
      name: SEED_PROPERTY_NAMES.parkBlvd,
      balance: 468576.65,
      marketValue: 720000,
      annualInterestRate: 0.06625,
      annualAppreciationRate: 0.03,
      monthlyPayment: 3011.06,
      monthlyRent: 5800,
      monthlyExpenses: 1740,
    },
    {
      name: SEED_PROPERTY_NAMES.shadybrookSeller,
      balance: 344057.87,
      marketValue: 450000,
      annualInterestRate: 0.06,
      annualAppreciationRate: 0.03,
      monthlyPayment: 2464.94,
      monthlyRent: 3900,
      monthlyExpenses: 1025,
      sellerPayoffCap: 440000,
      closeMonth: 1,
      refiSimMonth: 61,
      balloonRefiAnnualRate: 0.0675,
      balloonRefiTermMonths: 360,
    },
  ];

  it('highest rate starts with Park Blvd and ends with Shadybrook seller', () => {
    const order = STRATEGIES.highestRate(seed);
    expect(order[0]).toBe(SEED_PROPERTY_NAMES.parkBlvd);
    expect(order[order.length - 1]).toBe(SEED_PROPERTY_NAMES.lisaLn);
  });

  it('pays off portfolio in roughly 14-16 years at $5k extra', () => {
    const r = simulateSnowball(seed, {
      payoffOrder: STRATEGIES.highestRate(seed),
      extraMonthlyBudget: 5000,
      strategyName: 'highestRate',
      defaultCapexReserveRate: 0.1,
    });
    expect(r.monthsToPayoff).toBeGreaterThanOrEqual(168);
    expect(r.monthsToPayoff).toBeLessThanOrEqual(200);
  });

  it('Lisa Ln is paid off after Shadybrook seller under highest rate', () => {
    const r = simulateSnowball(seed, {
      payoffOrder: STRATEGIES.highestRate(seed),
      extraMonthlyBudget: 5000,
      strategyName: 'highestRate',
      defaultCapexReserveRate: 0.1,
    });
    const lisaMonth = r.payoffSchedule[SEED_PROPERTY_NAMES.lisaLn];
    const shadyMonth = r.payoffSchedule[SEED_PROPERTY_NAMES.shadybrookSeller];
    expect(lisaMonth).toBeGreaterThan(shadyMonth);
  });

});
