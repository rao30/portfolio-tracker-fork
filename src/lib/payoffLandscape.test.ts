import { describe, expect, it } from 'vitest';
import {
  buildBudgetLevels,
  computePayoffLandscape,
  defaultLandscapeRange,
  landscapeMatchesSimulation,
  portfolioSimulationSignature,
} from './payoffLandscape';
import type { Portfolio } from './types';

const miniPortfolio: Portfolio = {
  extraMonthlyBudget: 1000,
  annualRentGrowthRate: 0.02,
  annualExpenseInflationRate: 0.015,
  reinvestSurplus: true,
  monthlyReserveTarget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.05,
  defaultCapexReserveFlat: 0,
  taxProfile: {
    annualW2Income: 100000,
    spouseIsReps: false,
    marginalTaxRate: 0.24,
    taxYear: 2026,
    bonusDepreciationRate: 1,
    remainingBonusCarryover: 0,
    filingStatus: 'single',
    otherPassiveIncome: 0,
    stateTaxRate: 0,
  },
  acquisitionTemplate: {
    label: 'Default',
    purchasePrice: 150000,
    downPaymentPercent: 0.2,
    annualInterestRate: 0.07,
    loanTermMonths: 360,
    monthlyRent: 1200,
    monthlyExpenses: 200,
    landPercent: 0.2,
    costSegPercent: 0.25,
    useCostSeg: false,
  },
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  defaultRefiAnnualRate: 0.0675,
  defaultRefiTermMonths: 360,
  goals: [],
  properties: [
    {
      name: 'A',
      balance: 100_000,
      annualInterestRate: 0.07,
      annualAppreciationRate: 0.03,
      monthlyPayment: 800,
      monthlyRent: 1200,
      monthlyExpenses: 200,
      marketValue: 150_000,
    },
    {
      name: 'B',
      balance: 50_000,
      annualInterestRate: 0.05,
      annualAppreciationRate: 0.03,
      monthlyPayment: 400,
      monthlyRent: 700,
      monthlyExpenses: 100,
      marketValue: 80_000,
    },
  ],
};

describe('buildBudgetLevels', () => {
  it('generates stepped levels within max rows', () => {
    const levels = buildBudgetLevels(0, 2000, 500);
    expect(levels).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('includes current budget when off-step', () => {
    const levels = buildBudgetLevels(0, 2000, 500, 750);
    expect(levels).toContain(750);
  });
});

describe('computePayoffLandscape', () => {
  it('returns a full strategy × budget grid', () => {
    const grid = computePayoffLandscape(miniPortfolio, {
      metric: 'monthsToPayoff',
      budgetMin: 0,
      budgetMax: 1000,
      budgetStep: 500,
      activeStrategy: 'highestRate',
      activeBudget: 1000,
    });

    expect(grid.budgets.length).toBeGreaterThanOrEqual(3);
    expect(grid.strategies.length).toBe(6);
    expect(grid.cells.length).toBe(grid.budgets.length);
    expect(grid.cells[0].length).toBe(6);
    expect(grid.optimalCell).not.toBeNull();
    expect(grid.optimalCell?.isOptimal).toBe(true);
  });

  it('marks active cell at current budget and strategy', () => {
    const grid = computePayoffLandscape(miniPortfolio, {
      metric: 'monthsToPayoff',
      budgetMin: 0,
      budgetMax: 1000,
      budgetStep: 500,
      activeStrategy: 'lowestBalance',
      activeBudget: 1000,
    });

    expect(grid.activeCell?.strategyId).toBe('lowestBalance');
    expect(grid.activeCell?.budget).toBe(1000);
  });

  it('higher budget generally reduces months to payoff', () => {
    const grid = computePayoffLandscape(miniPortfolio, {
      metric: 'monthsToPayoff',
      budgetMin: 0,
      budgetMax: 2000,
      budgetStep: 1000,
      activeStrategy: 'highestRate',
      activeBudget: 0,
    });

    const zeroBudget = grid.cells[0].find((c) => c.strategyId === 'highestRate')!;
    const highBudget = grid.cells[grid.cells.length - 1].find(
      (c) => c.strategyId === 'highestRate',
    )!;
    expect(highBudget.monthsToPayoff).toBeLessThanOrEqual(zeroBudget.monthsToPayoff);
  });

  it('reacts to rent growth and expense inflation assumptions', () => {
    const lowGrowth = computePayoffLandscape(miniPortfolio, {
      metric: 'monthsToPayoff',
      budgetMin: 1000,
      budgetMax: 1000,
      budgetStep: 500,
      activeStrategy: 'highestRate',
      activeBudget: 1000,
    });
    const highGrowth = computePayoffLandscape(
      {
        ...miniPortfolio,
        annualRentGrowthRate: 0.08,
        annualExpenseInflationRate: 0.06,
      },
      {
        metric: 'monthsToPayoff',
        budgetMin: 1000,
        budgetMax: 1000,
        budgetStep: 500,
        activeStrategy: 'highestRate',
        activeBudget: 1000,
      },
    );

    const lowCell = lowGrowth.cells[0].find((c) => c.strategyId === 'highestRate')!;
    const highCell = highGrowth.cells[0].find((c) => c.strategyId === 'highestRate')!;
    expect(portfolioSimulationSignature(miniPortfolio)).not.toBe(
      portfolioSimulationSignature({
        ...miniPortfolio,
        annualRentGrowthRate: 0.08,
        annualExpenseInflationRate: 0.06,
      }),
    );
    expect(highCell.monthsToPayoff).not.toBe(lowCell.monthsToPayoff);
  });
});

describe('defaultLandscapeRange', () => {
  it('scales max budget with portfolio size', () => {
    const range = defaultLandscapeRange(miniPortfolio);
    expect(range.budgetMin).toBe(0);
    expect(range.budgetMax).toBeGreaterThanOrEqual(2000);
    expect(range.budgetStep).toBeGreaterThanOrEqual(250);
  });
});

describe('landscapeMatchesSimulation', () => {
  it('grid months match direct simulation', () => {
    const grid = computePayoffLandscape(miniPortfolio, {
      metric: 'monthsToPayoff',
      budgetMin: 500,
      budgetMax: 500,
      budgetStep: 500,
      activeStrategy: 'highestRate',
      activeBudget: 500,
    });
    const cell = grid.cells[0][0];
    expect(
      landscapeMatchesSimulation(
        miniPortfolio,
        cell.strategyId,
        cell.budget,
        cell.monthsToPayoff,
      ),
    ).toBe(true);
  });
});
