import { describe, expect, it } from 'vitest';
import {
  buildPrincipalVelocitySeries,
  computePrincipalVelocityAnalysis,
  computePrincipalVelocityPreviewDelta,
} from './principalVelocity';
import type { Portfolio } from './types';

function minimalPortfolio(extraBudget = 2000): Portfolio {
  return {
    extraMonthlyBudget: extraBudget,
    annualRentGrowthRate: 0.02,
    annualExpenseInflationRate: 0.015,
    reinvestSurplus: false,
    monthlyReserveTarget: 0,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0.1,
    defaultCapexReserveFlat: 0,
    simulationAnchorYear: 2026,
    simulationAnchorMonth: 1,
    properties: [
      {
        name: 'Property A',
        balance: 200_000,
        marketValue: 300_000,
        annualInterestRate: 0.065,
        annualAppreciationRate: 0.03,
        monthlyPayment: 1500,
        monthlyRent: 2500,
        monthlyExpenses: 400,
      },
      {
        name: 'Property B',
        balance: 150_000,
        marketValue: 220_000,
        annualInterestRate: 0.055,
        annualAppreciationRate: 0.03,
        monthlyPayment: 1100,
        monthlyRent: 1800,
        monthlyExpenses: 300,
      },
    ],
  };
}

describe('principalVelocity', () => {
  it('builds series with accelerating principal vs baseline', () => {
    const portfolio = minimalPortfolio(3000);
    const analysis = computePrincipalVelocityAnalysis(portfolio, 'highestRate', 60);
    expect(analysis.points.length).toBeGreaterThan(0);
    expect(analysis.year1TotalPrincipal).toBeGreaterThan(analysis.baselineYear1Principal);
    expect(analysis.accelerationFactorYear1).toBeGreaterThan(1);
  });

  it('preview delta increases with higher budget', () => {
    const portfolio = minimalPortfolio(1000);
    const delta = computePrincipalVelocityPreviewDelta(
      portfolio,
      'highestRate',
      1000,
      4000,
      120,
    );
    expect(delta.year1PrincipalDelta).toBeGreaterThan(0);
    expect(delta.accelerationDelta).toBeGreaterThanOrEqual(0);
  });

  it('property shares sum to meaningful allocation', () => {
    const portfolio = minimalPortfolio(2000);
    const analysis = computePrincipalVelocityAnalysis(portfolio, 'lowestBalance', 36);
    const totalPct = analysis.propertyShares.reduce((s, p) => s + p.percentOfPortfolio, 0);
    expect(totalPct).toBeGreaterThan(99);
    expect(totalPct).toBeLessThanOrEqual(100.01);
  });

  it('series respects horizon cap', () => {
    const portfolio = minimalPortfolio(1500);
    const analysis = computePrincipalVelocityAnalysis(portfolio, 'highestRate', 24);
    expect(analysis.points.length).toBeLessThanOrEqual(24);
    expect(buildPrincipalVelocitySeries(
      { history: analysis.points.map((p, i) => ({
        month: i + 1,
        totalPrincipalThisMonth: p.totalPrincipal,
        totalExtraApplied: p.extraPrincipal,
        monthlyCashflow: p.monthlyCashflow,
        totalEquity: 0,
        balancesByName: {},
      })) } as never,
      { history: analysis.points.map((p, i) => ({
        month: i + 1,
        totalPrincipalThisMonth: p.baselinePrincipal,
        totalExtraApplied: 0,
        monthlyCashflow: 0,
        totalEquity: 0,
        balancesByName: {},
      })) } as never,
      12,
    ).length).toBeLessThanOrEqual(12);
  });
});
