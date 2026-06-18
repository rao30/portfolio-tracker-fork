import { describe, expect, it } from 'vitest';
import type { Portfolio, Property } from './types';
import {
  computeExitCompassAnalysis,
  computeSaleTaxBreakdown,
  DEFAULT_EXIT_ASSUMPTIONS,
  preferencesToAssumptions,
  recommendationLabel,
} from './exitCompass';
import type { ExitCompassPreferences } from './exitCompassTypes';

function baseProperty(overrides: Partial<Property> = {}): Property {
  return {
    name: 'Test Rental',
    balance: 200_000,
    marketValue: 300_000,
    annualInterestRate: 0.08,
    annualAppreciationRate: 0.03,
    monthlyPayment: 1_500,
    monthlyRent: 2_200,
    monthlyExpenses: 400,
    purchasePrice: 250_000,
    placedInServiceYear: 2018,
    ...overrides,
  };
}

function basePortfolio(properties: Property[]): Portfolio {
  return {
    extraMonthlyBudget: 500,
    annualRentGrowthRate: 0.02,
    annualExpenseInflationRate: 0.015,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0.1,
    properties,
    simulationAnchorYear: 2026,
  };
}

describe('computeSaleTaxBreakdown', () => {
  it('charges capital gains and recapture on taxable sale', () => {
    const property = baseProperty();
    const portfolio = basePortfolio([property]);
    const tax = computeSaleTaxBreakdown(property, portfolio, DEFAULT_EXIT_ASSUMPTIONS, false);
    expect(tax.closingCosts).toBeGreaterThan(0);
    expect(tax.totalTax).toBeGreaterThan(0);
    expect(tax.netProceeds).toBeLessThan(tax.grossEquity);
  });

  it('defers taxes on 1031 exchange path', () => {
    const property = baseProperty();
    const portfolio = basePortfolio([property]);
    const tax = computeSaleTaxBreakdown(property, portfolio, DEFAULT_EXIT_ASSUMPTIONS, true);
    expect(tax.totalTax).toBe(0);
    expect(tax.netProceeds).toBeGreaterThan(
      computeSaleTaxBreakdown(property, portfolio, DEFAULT_EXIT_ASSUMPTIONS, false).netProceeds,
    );
  });
});

describe('computeExitCompassAnalysis', () => {
  it('analyzes each property with three exit paths', () => {
    const portfolio = basePortfolio([
      baseProperty({ name: 'Strong Performer' }),
      baseProperty({
        name: 'Weak Performer',
        monthlyRent: 1_200,
        monthlyExpenses: 500,
        balance: 280_000,
      }),
    ]);
    const analysis = computeExitCompassAnalysis(
      portfolio,
      'highestRate',
      DEFAULT_EXIT_ASSUMPTIONS,
    );
    expect(analysis.properties).toHaveLength(2);
    for (const row of analysis.properties) {
      expect(row.paths).toHaveLength(3);
      expect(row.paths.map((p) => p.pathId)).toEqual(['hold', 'sell', 'exchange']);
    }
  });

  it('ranks low-ROE properties as stronger exit candidates', () => {
    const portfolio = basePortfolio([
      baseProperty({
        name: 'Cash Cow',
        monthlyRent: 3_500,
        balance: 100_000,
        marketValue: 350_000,
      }),
      baseProperty({
        name: 'Dead Equity',
        monthlyRent: 900,
        balance: 290_000,
        marketValue: 300_000,
      }),
    ]);
    const analysis = computeExitCompassAnalysis(
      portfolio,
      'highestRate',
      { ...DEFAULT_EXIT_ASSUMPTIONS, sellAtMonth: 1 },
    );
    const deadEquity = analysis.properties.find((p) => p.propertyName === 'Dead Equity');
    const cashCow = analysis.properties.find((p) => p.propertyName === 'Cash Cow');
    expect(deadEquity).toBeDefined();
    expect(cashCow).toBeDefined();
    expect(deadEquity!.keepScore).toBeLessThan(cashCow!.keepScore);
  });

  it('maps preferences to assumptions', () => {
    const prefs: ExitCompassPreferences = {
      isCollapsed: false,
      pinnedProperty: null,
      analysisMode: 'sell',
      sellAtMonth: 24,
      closingCostPct: 0.07,
      capitalGainsRate: 0.2,
      recaptureRate: 0.25,
      holdHorizonMonths: 180,
      proceedsToDebtPct: 0.8,
      showTaxBreakdown: true,
      updatedAt: new Date().toISOString(),
    };
    const assumptions = preferencesToAssumptions(prefs);
    expect(assumptions.sellAtMonth).toBe(24);
    expect(assumptions.proceedsToDebtPct).toBe(0.8);
  });

  it('labels recommendations', () => {
    expect(recommendationLabel('hold')).toBe('Keep');
    expect(recommendationLabel('exchange')).toBe('1031');
  });
});
