import { describe, expect, it } from 'vitest';
import {
  buildBudgetLevels,
  computePayoffLandscape,
  defaultLandscapeRange,
  landscapeMatchesSimulation,
} from './payoffLandscape';
import type { Portfolio } from './types';

const miniPortfolio: Portfolio = {
  extraMonthlyBudget: 1000,
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
