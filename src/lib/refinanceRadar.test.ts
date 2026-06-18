import { describe, expect, it } from 'vitest';
import { buildRefinanceRadarAnalysis } from './refinanceRadar';
import { DEFAULT_REFINANCE_ASSUMPTIONS } from './refinanceRadarTypes';
import type { Portfolio } from './types';

function sellerProperty(overrides: Partial<Portfolio['properties'][0]> = {}) {
  return {
    name: 'Test Seller / 123 Main',
    balance: 180000,
    marketValue: 250000,
    annualInterestRate: 0.05,
    annualAppreciationRate: 0.03,
    monthlyPayment: 1100,
    monthlyRent: 2200,
    monthlyExpenses: 400,
    financingType: 'seller' as const,
    balloonMonths: 60,
    sellerAmortizationMonths: 240,
    balloonRefiAnnualRate: 0.07,
    balloonRefiTermMonths: 360,
    closeMonth: 1,
    ...overrides,
  };
}

function basePortfolio(
  properties: Portfolio['properties'] = [sellerProperty()],
): Portfolio {
  return {
    properties,
    extraMonthlyBudget: 500,
    annualRentGrowthRate: 0.02,
    annualExpenseInflationRate: 0.015,
    reinvestSurplus: true,
    monthlyReserveTarget: 0,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0.1,
    defaultRefiAnnualRate: 0.07,
    defaultRefiTermMonths: 360,
    simulationAnchorYear: 2026,
    simulationAnchorMonth: 1,
  };
}

describe('buildRefinanceRadarAnalysis', () => {
  it('analyzes seller-financed properties with balloon events', () => {
    const analysis = buildRefinanceRadarAnalysis(
      basePortfolio(),
      DEFAULT_REFINANCE_ASSUMPTIONS,
      'both',
      1,
    );

    expect(analysis.properties).toHaveLength(1);
    const row = analysis.properties[0];
    expect(row.propertyName).toContain('Test Seller');
    expect(row.eventMonth).toBe(61);
    expect(row.rateShocks).toHaveLength(4);
    expect(row.dscrAtRefi).toBeGreaterThan(0);
    expect(row.actionLabel.length).toBeGreaterThan(0);
  });

  it('flags urgent window when balloon is within 12 months', () => {
    const analysis = buildRefinanceRadarAnalysis(
      basePortfolio([sellerProperty({ balloonMonths: 8, closeMonth: 1 })]),
      DEFAULT_REFINANCE_ASSUMPTIONS,
      'rate_term',
      1,
    );

    expect(analysis.urgentCount).toBeGreaterThanOrEqual(1);
    expect(analysis.properties[0].status).toBe('window_open');
  });

  it('computes cash-out capacity for conventional properties', () => {
    const analysis = buildRefinanceRadarAnalysis(
      basePortfolio([
        {
          ...sellerProperty(),
          name: 'Conventional / Oak',
          financingType: 'conventional',
          balloonMonths: undefined,
        },
      ]),
      { ...DEFAULT_REFINANCE_ASSUMPTIONS, cashOutLtv: 0.75 },
      'cash_out',
      1,
    );

    expect(analysis.properties[0].cashOutProceeds).toBeGreaterThan(0);
    expect(analysis.portfolioCashOutCapacity).toBeGreaterThan(0);
  });

  it('sorts properties by priority score descending', () => {
    const analysis = buildRefinanceRadarAnalysis(
      basePortfolio([
        sellerProperty({ name: 'Safe / A', balloonMonths: 120 }),
        sellerProperty({ name: 'Urgent / B', balloonMonths: 6 }),
      ]),
      DEFAULT_REFINANCE_ASSUMPTIONS,
      'both',
      1,
    );

    expect(analysis.properties[0].propertyName).toContain('Urgent');
  });
});
