import { describe, expect, it } from 'vitest';
import { normalizePortfolio } from './snowball';
import { buildStrategyLabAnalysis } from './strategyLab';

const seedPortfolio = normalizePortfolio({
  properties: [
    {
      name: 'A',
      balance: 200_000,
      market_value: 300_000,
      annual_interest_rate: 0.07,
      monthly_payment: 1_400,
      monthly_rent: 2_200,
      monthly_expenses: 400,
    },
    {
      name: 'B',
      balance: 80_000,
      market_value: 150_000,
      annual_interest_rate: 0.055,
      monthly_payment: 600,
      monthly_rent: 1_100,
      monthly_expenses: 200,
    },
  ],
  extra_monthly_budget: 2_000,
  annual_rent_growth_rate: 0.025,
  annual_expense_inflation_rate: 0.02,
});

describe('buildStrategyLabAnalysis', () => {
  it('ranks strategies and marks the fastest as best', () => {
    const analysis = buildStrategyLabAnalysis(seedPortfolio, 'lowestBalance');
    expect(analysis.rows).toHaveLength(6);
    expect(analysis.bestId).toBe(analysis.rows[0].id);
    expect(analysis.rows[0].isBest).toBe(true);
    expect(analysis.rows[0].rank).toBe(1);
  });

  it('computes deltas relative to the active strategy', () => {
    const analysis = buildStrategyLabAnalysis(seedPortfolio, 'lowestBalance');
    const active = analysis.rows.find((r) => r.id === 'lowestBalance');
    expect(active?.deltaMonths).toBe(0);
    expect(active?.deltaInterest).toBe(0);
    expect(active?.isActive).toBe(true);
  });

  it('recommends switching when another strategy wins', () => {
    const analysis = buildStrategyLabAnalysis(seedPortfolio, 'lowestBalance');
    if (analysis.bestId !== 'lowestBalance') {
      expect(analysis.headline).toContain('Switch to');
      expect(analysis.recommendation.length).toBeGreaterThan(10);
    } else {
      expect(analysis.headline).toContain('fastest path');
    }
  });

  it('responds to budget overrides in the lab', () => {
    const low = buildStrategyLabAnalysis(seedPortfolio, 'highestRate', 500);
    const high = buildStrategyLabAnalysis(seedPortfolio, 'highestRate', 5_000);
    expect(high.previewResult.monthsToPayoff).toBeLessThanOrEqual(
      low.previewResult.monthsToPayoff,
    );
  });
});
