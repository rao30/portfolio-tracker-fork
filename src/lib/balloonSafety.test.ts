import { describe, expect, it } from 'vitest';
import type { Portfolio, Property } from './types';
import {
  buildBalloonSafetyAnalysis,
  reorderForBalloonSafety,
  solveMinBudgetForProperty,
} from './balloonSafety';

function sellerProperty(overrides: Partial<Property> = {}): Property {
  return {
    name: 'Test Seller Duplex',
    balance: 200000,
    annualInterestRate: 0.06,
    monthlyPayment: 1500,
    monthlyRent: 2800,
    monthlyExpenses: 900,
    financingType: 'seller',
    balloonMonths: 60,
    sellerAmortizationMonths: 240,
    sellerPayoffCap: 360000,
    closeMonth: 1,
    ...overrides,
  };
}

function basePortfolio(properties: Property[]): Portfolio {
  return {
    properties,
    extraMonthlyBudget: 2000,
    annualRentGrowthRate: 0.03,
    annualExpenseInflationRate: 0.02,
    reinvestSurplus: false,
    monthlyReserveTarget: 0,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0,
    goals: [],
    taxProfile: { filingStatus: 'married_filing_jointly', w2Income: 0 },
  };
}

describe('buildBalloonSafetyAnalysis', () => {
  it('returns empty verdict when no seller properties', () => {
    const portfolio = basePortfolio([
      {
        name: 'Conv Only',
        balance: 100000,
        annualInterestRate: 0.065,
        monthlyPayment: 800,
        monthlyRent: 1500,
        monthlyExpenses: 500,
        financingType: 'conventional',
      },
    ]);
    const analysis = buildBalloonSafetyAnalysis(portfolio, 'highestRate');
    expect(analysis.sellerCount).toBe(0);
    expect(analysis.verdict).toContain('No seller-financed');
  });

  it('flags at-risk when payoff exceeds balloon window', () => {
    const portfolio = basePortfolio([
      sellerProperty({
        name: '1419/1421 Deborah Dr (seller 6%, 5yr balloon)',
        balance: 350000,
        monthlyPayment: 2200,
        balloonMonths: 24,
        closeMonth: 1,
      }),
    ]);
    const analysis = buildBalloonSafetyAnalysis(portfolio, 'lowestBalance');
    expect(analysis.sellerCount).toBe(1);
    expect(['at_risk', 'critical']).toContain(analysis.properties[0].status);
    expect(analysis.atRiskCount).toBeGreaterThanOrEqual(1);
  });

  it('marks safe when high budget pays off before balloon', () => {
    const portfolio = basePortfolio([
      sellerProperty({
        balance: 50000,
        monthlyPayment: 400,
        balloonMonths: 120,
      }),
    ]);
    portfolio.extraMonthlyBudget = 15000;
    const analysis = buildBalloonSafetyAnalysis(portfolio, 'highestRate');
    expect(analysis.safeCount).toBeGreaterThanOrEqual(1);
    expect(analysis.verdictTone).toBe('positive');
  });
});

describe('solveMinBudgetForProperty', () => {
  it('returns null when already safe', () => {
    const portfolio = basePortfolio([
      sellerProperty({ balance: 30000, monthlyPayment: 300, balloonMonths: 120 }),
    ]);
    portfolio.extraMonthlyBudget = 10000;
    const delta = solveMinBudgetForProperty(
      portfolio,
      'Test Seller Duplex',
      'highestRate',
      null,
      null,
      1,
    );
    expect(delta).toBeNull();
  });
});

describe('reorderForBalloonSafety', () => {
  it('moves at-risk properties to front of order', () => {
    const portfolio = basePortfolio([
      sellerProperty({ name: 'Safe Prop', balance: 20000, monthlyPayment: 400, balloonMonths: 120 }),
      sellerProperty({
        name: 'Risk Prop',
        balance: 400000,
        monthlyPayment: 2500,
        balloonMonths: 18,
      }),
    ]);
    const analysis = buildBalloonSafetyAnalysis(portfolio, 'highestRate');
    const reordered = reorderForBalloonSafety(
      portfolio,
      ['Safe Prop', 'Risk Prop'],
      analysis,
    );
    if (analysis.atRiskCount > 0) {
      expect(reordered[0]).toBe('Risk Prop');
    }
  });
});
