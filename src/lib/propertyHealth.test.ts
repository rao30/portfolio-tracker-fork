import { describe, expect, it } from 'vitest';
import { buildPropertyHealth } from './propertyHealth';
import type { Portfolio, Property } from './types';

const baseProperty: Property = {
  name: 'Test Duplex',
  balance: 200_000,
  marketValue: 280_000,
  annualInterestRate: 0.065,
  annualAppreciationRate: 0.03,
  monthlyPayment: 1_400,
  monthlyRent: 2_400,
  monthlyExpenses: 600,
};

function miniPortfolio(properties: Property[]): Portfolio {
  return {
    properties,
    extraMonthlyBudget: 500,
    annualRentGrowthRate: 0.02,
    annualExpenseInflationRate: 0.015,
    reinvestSurplus: true,
    monthlyReserveTarget: 0,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0.05,
    goals: [],
  };
}

const basePortfolio = miniPortfolio([baseProperty]);

describe('buildPropertyHealth', () => {
  it('scores healthy rental property as ok', () => {
    const health = buildPropertyHealth(baseProperty, basePortfolio);
    expect(health.severity).toBe('ok');
    expect(health.score).toBeGreaterThanOrEqual(70);
    expect(health.metrics.dscr).toBeGreaterThan(1);
    expect(health.metrics.monthlyCashflow).toBeGreaterThan(0);
  });

  it('flags P&I below interest as critical', () => {
    const bad: Property = {
      ...baseProperty,
      monthlyPayment: 500,
    };
    const health = buildPropertyHealth(bad, basePortfolio);
    expect(health.issues.some((i) => i.message.includes('cover interest'))).toBe(true);
    expect(health.severity).not.toBe('ok');
  });

  it('flags negative cashflow', () => {
    const bad: Property = {
      ...baseProperty,
      monthlyRent: 900,
      monthlyExpenses: 800,
    };
    const health = buildPropertyHealth(bad, basePortfolio);
    expect(health.metrics.monthlyCashflow).toBeLessThan(0);
    expect(health.score).toBeLessThan(100);
  });
});
