import { describe, expect, it } from 'vitest';
import {
  buildPrincipalVelocitySeries,
  computePrincipalVelocityAnalysis,
  computePrincipalVelocityPreviewDelta,
} from './principalVelocity';
import { normalizePortfolio } from './snowball';

function minimalPortfolio(extraBudget = 2000) {
  return normalizePortfolio({
    extra_monthly_budget: extraBudget,
    annual_rent_growth_rate: 0.02,
    annual_expense_inflation_rate: 0.015,
    reinvest_surplus: false,
    monthly_reserve_target: 0,
    default_vacancy_rate: 0.05,
    default_capex_reserve_rate: 0.1,
    default_capex_reserve_flat: 0,
    simulation_anchor_year: 2026,
    simulation_anchor_month: 1,
    goals: [],
    properties: [
      {
        name: 'Property A',
        balance: 200_000,
        market_value: 300_000,
        annual_interest_rate: 0.065,
        annual_appreciation_rate: 0.03,
        monthly_payment: 1500,
        monthly_rent: 2500,
        monthly_expenses: 400,
      },
      {
        name: 'Property B',
        balance: 150_000,
        market_value: 220_000,
        annual_interest_rate: 0.055,
        annual_appreciation_rate: 0.03,
        monthly_payment: 1100,
        monthly_rent: 1800,
        monthly_expenses: 300,
      },
    ],
  });
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
