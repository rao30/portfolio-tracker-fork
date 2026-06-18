import { describe, expect, it } from 'vitest';
import type { Portfolio, Property } from './types';
import {
  buildRefinanceRadarAnalysis,
  DEFAULT_REFINANCE_ASSUMPTIONS,
  preferencesToAssumptions,
  verdictLabel,
} from './refinanceRadar';
import type { RefinanceRadarPreferences } from './refinanceRadarTypes';

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
    ...overrides,
  };
}

function basePortfolio(properties: Property[]): Portfolio {
  return {
    extraMonthlyBudget: 0,
    annualRentGrowthRate: 0.02,
    annualExpenseInflationRate: 0.015,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0.1,
    properties,
    simulationAnchorYear: 2026,
  };
}

describe('buildRefinanceRadarAnalysis', () => {
  it('flags strong rate-and-term refi when market rate is well below note', () => {
    const portfolio = basePortfolio([
      baseProperty({ annualInterestRate: 0.085, monthlyPayment: 1_600 }),
    ]);
    const analysis = buildRefinanceRadarAnalysis(portfolio, {
      ...DEFAULT_REFINANCE_ASSUMPTIONS,
      marketRate: 0.065,
      holdPeriodMonths: 84,
    });
    expect(analysis.properties).toHaveLength(1);
    expect(analysis.properties[0].rateTermVerdict).toBe('strong');
    expect(analysis.properties[0].monthlySavings).toBeGreaterThan(0);
    expect(analysis.strongCount).toBeGreaterThanOrEqual(1);
  });

  it('skips refi when market rate exceeds current note', () => {
    const portfolio = basePortfolio([
      baseProperty({ annualInterestRate: 0.05, monthlyPayment: 1_100 }),
    ]);
    const analysis = buildRefinanceRadarAnalysis(portfolio, {
      ...DEFAULT_REFINANCE_ASSUMPTIONS,
      marketRate: 0.07,
    });
    expect(analysis.properties[0].rateTermVerdict).toBe('skip');
    expect(analysis.properties[0].monthlySavings).toBeLessThanOrEqual(0);
  });

  it('blocks cash-out when post-refi DSCR falls below minimum', () => {
    const portfolio = basePortfolio([
      baseProperty({
        balance: 150_000,
        marketValue: 320_000,
        monthlyPayment: 1_200,
        monthlyRent: 1_600,
        monthlyExpenses: 550,
      }),
    ]);
    const analysis = buildRefinanceRadarAnalysis(portfolio, {
      ...DEFAULT_REFINANCE_ASSUMPTIONS,
      cashOutLtv: 0.75,
      minDscr: 1.2,
    });
    expect(analysis.properties[0].cashOutNet).toBeGreaterThan(0);
    expect(analysis.properties[0].cashOutVerdict).toBe('blocked');
  });

  it('marks distant seller balloons as balloon_pending', () => {
    const portfolio = basePortfolio([
      baseProperty({
        name: 'Seller Duplex',
        financingType: 'seller',
        balloonMonths: 60,
        closeMonth: 1,
        sellerPayoffCap: 200_000,
      }),
    ]);
    const analysis = buildRefinanceRadarAnalysis(portfolio, DEFAULT_REFINANCE_ASSUMPTIONS);
    expect(analysis.properties[0].primaryVerdict).toBe('balloon_pending');
    expect(analysis.properties[0].monthsUntilBalloon).toBeGreaterThan(12);
    expect(analysis.properties[0].headline.length).toBeGreaterThan(0);
    expect(analysis.properties[0].headline).toContain('Balloon refi');
  });

  it('sorts strong opportunities ahead of skip', () => {
    const portfolio = basePortfolio([
      baseProperty({ name: 'Low rate', annualInterestRate: 0.05, monthlyPayment: 1_000 }),
      baseProperty({ name: 'High rate', annualInterestRate: 0.09, monthlyPayment: 1_700 }),
    ]);
    const analysis = buildRefinanceRadarAnalysis(portfolio, {
      ...DEFAULT_REFINANCE_ASSUMPTIONS,
      marketRate: 0.065,
    });
    expect(analysis.properties[0].propertyName).toBe('High rate');
  });
});

describe('preferencesToAssumptions', () => {
  it('maps stored preferences into analysis assumptions', () => {
    const prefs: RefinanceRadarPreferences = {
      isCollapsed: false,
      pinnedProperty: null,
      analysisMode: 'cash_out',
      marketRate: 0.068,
      closingCostPct: 0.03,
      holdPeriodMonths: 48,
      cashOutLtv: 0.7,
      minDscr: 1.1,
      deploymentYield: 0.15,
      refiTermMonths: 300,
      updatedAt: new Date(0).toISOString(),
    };
    const assumptions = preferencesToAssumptions(prefs);
    expect(assumptions.analysisMode).toBe('cash_out');
    expect(assumptions.marketRate).toBe(0.068);
    expect(assumptions.refiTermMonths).toBe(300);
  });
});

describe('verdictLabel', () => {
  it('returns human labels', () => {
    expect(verdictLabel('strong')).toBe('Strong');
    expect(verdictLabel('blocked')).toBe('DSCR blocked');
  });
});
