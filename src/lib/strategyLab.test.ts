import { describe, expect, it } from 'vitest';
import {
  committedSnapshot,
  computeStrategyLabPreviewDelta,
  findMatchingPinId,
  pinToSnapshot,
  snapshotsMatch,
} from './strategyLab';
import { normalizePortfolio, SCENARIO_PRESETS } from './snowball';
import type { StrategyLabScenario } from './strategyLabTypes';

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

const baseScenario = SCENARIO_PRESETS[0];

describe('strategyLab', () => {
  it('detects matching committed pin', () => {
    const pins: StrategyLabScenario[] = [
      {
        id: 'pin-1',
        name: 'Current',
        extraMonthlyBudget: 2000,
        strategyId: 'highestRate',
        scenario: null,
        isPinned: true,
        notes: null,
        sortOrder: 1,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const match = findMatchingPinId(
      pins,
      portfolio,
      2000,
      'highestRate',
      baseScenario,
    );
    expect(match).toBe('pin-1');
  });

  it('higher budget preview accelerates payoff', () => {
    const committed = committedSnapshot(portfolio, 2000, 'highestRate', baseScenario);
    const preview = committedSnapshot(portfolio, 4000, 'highestRate', baseScenario);
    const delta = computeStrategyLabPreviewDelta(portfolio, committed, preview);
    expect(delta.monthsDelta).toBeLessThan(0);
    expect(delta.budgetDelta).toBe(2000);
  });

  it('snapshotsMatch ignores pin id', () => {
    const a = pinToSnapshot(portfolio, {
      id: 'a',
      name: 'A',
      extraMonthlyBudget: 2000,
      strategyId: 'highestRate',
      scenario: null,
      isPinned: true,
      notes: null,
      sortOrder: 1,
      createdAt: '',
      updatedAt: '',
    });
    const b = committedSnapshot(portfolio, 2000, 'highestRate', baseScenario);
    expect(snapshotsMatch(a, b)).toBe(true);
  });
});
