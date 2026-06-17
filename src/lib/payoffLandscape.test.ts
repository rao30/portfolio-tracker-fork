import { describe, expect, it } from 'vitest';
import {
  buildBudgetColumns,
  computePayoffLandscape,
  defaultLandscapeViewport,
  landscapeCellScore,
  landscapeColor,
} from './payoffLandscape';
import { normalizePortfolio } from './snowball';

const portfolio = normalizePortfolio({
  extra_monthly_budget: 1000,
  annual_rent_growth_rate: 0.03,
  annual_expense_inflation_rate: 0.02,
  reinvest_surplus: false,
  monthly_reserve_target: 0,
  default_vacancy_rate: 0.05,
  default_capex_reserve_rate: 0.05,
  simulation_anchor_year: 2026,
  simulation_anchor_month: 1,
  goals: [],
  properties: [
    {
      name: 'Property A',
      balance: 200_000,
      annual_interest_rate: 0.07,
      monthly_payment: 1500,
      monthly_rent: 2200,
      monthly_expenses: 400,
      market_value: 300_000,
      acquisition_date: '2020-01-01',
    },
    {
      name: 'Property B',
      balance: 80_000,
      annual_interest_rate: 0.05,
      monthly_payment: 600,
      monthly_rent: 1100,
      monthly_expenses: 200,
      market_value: 150_000,
      acquisition_date: '2021-06-01',
    },
  ],
});

describe('buildBudgetColumns', () => {
  it('generates sorted unique budget steps', () => {
    expect(buildBudgetColumns(0, 2000, 500)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('includes max when not aligned to step', () => {
    const cols = buildBudgetColumns(0, 2500, 1000);
    expect(cols).toContain(2500);
    expect(cols[0]).toBe(0);
  });
});

describe('defaultLandscapeViewport', () => {
  it('caps budget max to portfolio ceiling', () => {
    const vp = defaultLandscapeViewport(portfolio, 10000);
    expect(vp.budgetMin).toBe(0);
    expect(vp.budgetMax).toBeLessThanOrEqual(10000);
    expect(vp.budgetStep).toBeGreaterThanOrEqual(500);
  });
});

describe('computePayoffLandscape', () => {
  it('returns a full strategy × budget grid', () => {
    const viewport = { metric: 'monthsToPayoff' as const, budgetMin: 0, budgetMax: 2000, budgetStep: 1000 };
    const analysis = computePayoffLandscape(portfolio, viewport, 'highestRate');

    expect(analysis.strategies.length).toBe(6);
    expect(analysis.budgets).toEqual([0, 1000, 2000]);
    expect(analysis.cells.length).toBe(18);
  });

  it('marks exactly one optimal cell (fastest payoff)', () => {
    const viewport = { metric: 'monthsToPayoff' as const, budgetMin: 0, budgetMax: 2000, budgetStep: 1000 };
    const analysis = computePayoffLandscape(portfolio, viewport, 'lowestBalance');
    const optimals = analysis.cells.filter((c) => c.isOptimal);
    expect(optimals).toHaveLength(1);
    expect(analysis.optimal.monthsToPayoff).toBe(optimals[0].monthsToPayoff);
  });

  it('marks current strategy and budget', () => {
    const viewport = { metric: 'monthsToPayoff' as const, budgetMin: 0, budgetMax: 2000, budgetStep: 1000 };
    const analysis = computePayoffLandscape(portfolio, viewport, 'highestRate');
    expect(analysis.currentCell?.strategyId).toBe('highestRate');
    expect(analysis.currentCell?.budget).toBe(1000);
    expect(analysis.currentCell?.isCurrent).toBe(true);
  });

  it('higher budget generally reduces months to payoff for same strategy', () => {
    const viewport = { metric: 'monthsToPayoff' as const, budgetMin: 0, budgetMax: 2000, budgetStep: 1000 };
    const analysis = computePayoffLandscape(portfolio, viewport, 'highestRate');
    const at0 = analysis.cells.find((c) => c.strategyId === 'highestRate' && c.budget === 0)!;
    const at2k = analysis.cells.find((c) => c.strategyId === 'highestRate' && c.budget === 2000)!;
    expect(at2k.monthsToPayoff).toBeLessThanOrEqual(at0.monthsToPayoff);
  });
});

describe('landscapeCellScore', () => {
  it('inverts scale for months metric (lower is greener)', () => {
    expect(landscapeCellScore(10, 'monthsToPayoff', 10, 20)).toBe(1);
    expect(landscapeCellScore(20, 'monthsToPayoff', 10, 20)).toBe(0);
  });

  it('uses direct scale for interest saved', () => {
    expect(landscapeCellScore(100, 'interestSaved', 0, 200)).toBe(0.5);
  });
});

describe('landscapeColor', () => {
  it('returns hsl string in valid range', () => {
    expect(landscapeColor(0.5)).toMatch(/^hsl\(\d+ 55% 28%\)$/);
  });
});
