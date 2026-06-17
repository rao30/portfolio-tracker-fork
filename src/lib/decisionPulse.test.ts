import { describe, expect, it } from 'vitest';
import {
  buildDecisionPulse,
  buildMonthlyAction,
  buildStrategyDuel,
  computeBudgetSensitivity,
  computeDecisionPulsePreview,
  computePreviewDelta,
} from './decisionPulse';
import { compareStrategies, normalizePortfolio, runSimulation } from './snowball';

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
    {
      name: 'Small',
      balance: 10000,
      market_value: 25000,
      annual_interest_rate: 0.05,
      annual_appreciation_rate: 0.03,
      monthly_payment: 200,
      monthly_rent: 600,
      monthly_expenses: 180,
    },
  ],
});

describe('buildMonthlyAction', () => {
  it('targets the first unpaid property in avalanche order', () => {
    const result = runSimulation(portfolio, 'highestRate', null);
    const action = buildMonthlyAction(portfolio, result, 'highestRate');
    expect(action.propertyName).toBe('HighRate');
    expect(action.annualRate).toBe(0.08);
    expect(action.rationale).toContain('Highest rate');
  });

  it('uses custom order when provided', () => {
    const result = runSimulation(portfolio, 'lowestBalance', null);
    const action = buildMonthlyAction(portfolio, result, 'lowestBalance', [
      'Small',
      'HighRate',
      'LowRate',
    ]);
    expect(action.propertyName).toBe('Small');
    expect(action.rationale).toContain('Payoff Playbook');
  });
});

describe('buildStrategyDuel', () => {
  it('recommends switching when active strategy is suboptimal', () => {
    const comparisons = compareStrategies(portfolio.properties, {
      extraMonthlyBudget: portfolio.extraMonthlyBudget,
    });
    const duel = buildStrategyDuel(comparisons, 'lowestBalance');
    expect(duel.winner).toBeTruthy();
    expect(duel.verdict.length).toBeGreaterThan(10);
  });

  it('confirms optimal strategy when active matches winner', () => {
    const comparisons = compareStrategies(portfolio.properties, {
      extraMonthlyBudget: portfolio.extraMonthlyBudget,
    });
    const winner = comparisons.find((r) => r.strategy !== 'baseline')!;
    const duel = buildStrategyDuel(
      comparisons,
      winner.strategy as 'highestRate',
    );
    expect(duel.verdict).toMatch(/optimal|fastest|ties/i);
  });
});

describe('computeBudgetSensitivity', () => {
  it('returns monotonically improving payoff with higher budget', () => {
    const points = computeBudgetSensitivity(portfolio, 'highestRate');
    expect(points.length).toBeGreaterThanOrEqual(3);
    const sorted = [...points].sort((a, b) => a.budget - b.budget);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].monthsToPayoff).toBeLessThanOrEqual(
        sorted[i - 1].monthsToPayoff,
      );
    }
  });
});

describe('computePreviewDelta', () => {
  it('returns null when preview matches committed budget', () => {
    const delta = computePreviewDelta(portfolio, portfolio.extraMonthlyBudget, 'highestRate');
    expect(delta).toBeNull();
  });

  it('shows earlier payoff with higher preview budget', () => {
    const delta = computePreviewDelta(
      portfolio,
      portfolio.extraMonthlyBudget + 1000,
      'highestRate',
    );
    expect(delta).not.toBeNull();
    expect(delta!.monthsDelta).toBeLessThanOrEqual(0);
  });
});

describe('computeDecisionPulsePreview', () => {
  it('runs isolated preview without mutating portfolio budget', () => {
    const preview = computeDecisionPulsePreview(
      portfolio,
      portfolio.extraMonthlyBudget + 500,
      'highestRate',
    );
    expect(portfolio.extraMonthlyBudget).toBe(2000);
    expect(preview.verdict).toBeTruthy();
    expect(preview.debtFreeLabel).toMatch(/20\d{2}/);
  });
});

describe('buildDecisionPulse', () => {
  it('assembles a complete analysis with verdict and action', () => {
    const comparisons = compareStrategies(portfolio.properties, {
      extraMonthlyBudget: portfolio.extraMonthlyBudget,
    });
    const active = runSimulation(portfolio, 'highestRate', null);
    const pulse = buildDecisionPulse(
      portfolio,
      'highestRate',
      active,
      comparisons,
    );
    expect(pulse.verdict).toBeTruthy();
    expect(pulse.action.propertyName).toBeTruthy();
    expect(pulse.sensitivity.length).toBeGreaterThan(0);
    expect(pulse.debtFreeLabel).toMatch(/20\d{2}/);
  });
});
