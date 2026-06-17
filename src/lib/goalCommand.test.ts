import { describe, expect, it } from 'vitest';
import {
  clampGoalTargetMonth,
  computeGoalBudgetPreviewDelta,
  computeGoalCommandAnalysis,
  defaultGoalPreferences,
  portfolioGoalsFromPreferences,
  simMonthFromCalendarYear,
} from './goalCommand';
import { normalizePortfolio, runSimulation } from './snowball';

const portfolio = normalizePortfolio({
  extra_monthly_budget: 2000,
  annual_rent_growth_rate: 0.025,
  annual_expense_inflation_rate: 0.02,
  reinvest_surplus: true,
  monthly_reserve_target: 0,
  default_vacancy_rate: 0.05,
  default_capex_reserve_rate: 0.05,
  simulation_anchor_year: 2026,
  simulation_anchor_month: 6,
  goals: [],
  properties: [
    {
      name: 'HighRate',
      balance: 100000,
      market_value: 160000,
      annual_interest_rate: 0.08,
      annual_appreciation_rate: 0.03,
      monthly_payment: 800,
      monthly_rent: 1500,
      monthly_expenses: 450,
    },
    {
      name: 'LowRate',
      balance: 50000,
      market_value: 90000,
      annual_interest_rate: 0.03,
      annual_appreciation_rate: 0.03,
      monthly_payment: 400,
      monthly_rent: 900,
      monthly_expenses: 270,
    },
  ],
});

describe('goalCommand', () => {
  it('maps calendar year to simulation month', () => {
    const month = simMonthFromCalendarYear(2036, portfolio);
    expect(month).toBeGreaterThan(60);
  });

  it('clamps target months', () => {
    expect(clampGoalTargetMonth(5)).toBe(12);
    expect(clampGoalTargetMonth(900)).toBe(600);
  });

  it('syncs portfolio goals from preferences', () => {
    const prefs = defaultGoalPreferences(portfolio);
    const goals = portfolioGoalsFromPreferences(prefs);
    expect(goals).toHaveLength(2);
    expect(goals[0]?.type).toBe('debtFreeByMonth');
    expect(goals[1]?.type).toBe('equityAtMonth');
  });

  it('reports behind schedule when payoff exceeds debt-free target', () => {
    const result = runSimulation(portfolio, 'highestRate', null);
    const prefs = {
      ...defaultGoalPreferences(portfolio),
      debtFreeTargetMonth: 12,
      activeGoalType: 'debtFree' as const,
    };
    const analysis = computeGoalCommandAnalysis(
      portfolio,
      result,
      'highestRate',
      prefs,
    );
    expect(analysis.isOnTrack).toBe(false);
    expect(analysis.requiredBudget).not.toBeNull();
  });

  it('preview delta accelerates payoff with higher budget', () => {
    const prefs = defaultGoalPreferences(portfolio);
    const delta = computeGoalBudgetPreviewDelta(
      portfolio,
      portfolio.extraMonthlyBudget + 1000,
      'highestRate',
      prefs,
    );
    expect(delta.payoffMonthPreview).toBeLessThanOrEqual(delta.payoffMonthCommitted);
  });
});
