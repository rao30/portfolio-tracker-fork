import { describe, expect, it } from 'vitest';
import type { Portfolio } from './types';
import {
  buildStrategyLabRows,
  computeScenarioMetrics,
  defaultScenarioName,
  scenarioMatchesActive,
} from './strategyLab';

const minimalPortfolio: Portfolio = {
  extraMonthlyBudget: 1000,
  annualRentGrowthRate: 0.025,
  annualExpenseInflationRate: 0.02,
  reinvestSurplus: true,
  monthlyReserveTarget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.05,
  defaultCapexReserveFlat: 0,
  taxProfile: {
    annualW2Income: 200_000,
    spouseIsReps: true,
    marginalTaxRate: 0.32,
    taxYear: 2026,
    bonusDepreciationRate: 0.6,
    remainingBonusCarryover: 0,
  },
  acquisitionTemplate: {
    label: 'Default',
    purchasePrice: 300_000,
    downPaymentPercent: 0.2,
    annualInterestRate: 0.07,
    loanTermMonths: 360,
    monthlyRent: 2500,
    monthlyExpenses: 400,
    landPercent: 0.2,
    costSegPercent: 0.3,
    useCostSeg: false,
  },
  goals: [],
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  defaultRefiAnnualRate: 0.0675,
  defaultRefiTermMonths: 360,
  properties: [
    {
      name: 'Test A',
      balance: 200_000,
      marketValue: 300_000,
      annualInterestRate: 0.07,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1500,
      monthlyRent: 2500,
      monthlyExpenses: 400,
    },
    {
      name: 'Test B',
      balance: 150_000,
      marketValue: 250_000,
      annualInterestRate: 0.065,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1200,
      monthlyRent: 2000,
      monthlyExpenses: 350,
    },
  ],
};

describe('strategyLab', () => {
  it('computes faster payoff with higher extra budget', () => {
    const low = computeScenarioMetrics(minimalPortfolio, 'highestRate', 500);
    const high = computeScenarioMetrics(minimalPortfolio, 'highestRate', 2000);
    expect(high.metrics.monthsToPayoff).toBeLessThan(low.metrics.monthsToPayoff);
    expect(high.metrics.interestSavedVsBaseline).toBeGreaterThan(0);
    expect(low.metrics.interestSavedVsBaseline).toBeGreaterThan(0);
  });

  it('builds rows with active flag', () => {
    const scenarios = [
      {
        id: '1',
        name: 'Base',
        extraMonthlyBudget: 1000,
        strategyId: 'highestRate' as const,
        isPinned: true,
        sortOrder: 0,
      },
      {
        id: '2',
        name: 'Aggressive',
        extraMonthlyBudget: 3000,
        strategyId: 'lowestBalance' as const,
        isPinned: true,
        sortOrder: 1,
      },
    ];
    const rows = buildStrategyLabRows(minimalPortfolio, scenarios, 1000, 'highestRate');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[1]?.isActive).toBe(false);
  });

  it('generates unique default names', () => {
    const names = ['$1,000 · Highest Rate (Avalanche)'];
    const next = defaultScenarioName(1000, 'highestRate', names);
    expect(next).toContain('(2)');
  });

  it('matches active scenario', () => {
    expect(scenarioMatchesActive({ extraMonthlyBudget: 1000, strategyId: 'highestRate' }, 1000, 'highestRate')).toBe(true);
    expect(scenarioMatchesActive({ extraMonthlyBudget: 1000, strategyId: 'highestRate' }, 2000, 'highestRate')).toBe(false);
  });
});
