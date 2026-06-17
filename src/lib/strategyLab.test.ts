import { describe, expect, it } from 'vitest';
import {
  buildStrategyLabRows,
  computeStrategyLabMetrics,
  defaultScenarioName,
} from './strategyLab';
import { normalizePortfolio } from './snowball';
import { readFileSync } from 'fs';
import path from 'path';

const seed = JSON.parse(
  readFileSync(path.join(process.cwd(), 'public/data/portfolio.json'), 'utf8'),
);
const portfolio = normalizePortfolio(seed);

describe('strategyLab', () => {
  it('builds default scenario names from strategy and budget', () => {
    expect(defaultScenarioName('highestRate', 500)).toContain('Highest Rate');
    expect(defaultScenarioName('highestRate', 500)).toContain('$500');
  });

  it('computes metrics with savings vs simulated baseline', () => {
    const baselineResult = computeStrategyLabMetrics(
      portfolio,
      'highestRate',
      0,
      { id: 'base', label: 'Base' },
      { monthsToPayoff: 9999, totalInterestPaid: 999_999_999 },
    );
    const metrics = computeStrategyLabMetrics(
      portfolio,
      'highestRate',
      2000,
      { id: 'base', label: 'Base' },
      {
        monthsToPayoff: baselineResult.monthsToPayoff,
        totalInterestPaid: baselineResult.totalInterestPaid,
      },
    );
    expect(metrics.monthsToPayoff).toBeLessThanOrEqual(baselineResult.monthsToPayoff);
    expect(metrics.interestSavedVsBaseline).toBeGreaterThanOrEqual(0);
    expect(metrics.debtFreeLabel).toMatch(/[A-Za-z]{3} \d{4}/);
  });

  it('includes a live row when controls differ from pinned scenarios', () => {
    const rows = buildStrategyLabRows(
      portfolio,
      [
        {
          id: 'a',
          name: 'Test',
          extraMonthlyBudget: 500,
          strategyId: 'lowestBalance',
          isPinned: true,
          notes: null,
          sortOrder: 0,
        },
      ],
      { strategyId: 'highestRate', extraMonthlyBudget: 1000 },
      { id: 'base', label: 'Base' },
    );
    expect(rows[0]?.isLive).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('omits live row when it matches a pinned scenario', () => {
    const rows = buildStrategyLabRows(
      portfolio,
      [
        {
          id: 'a',
          name: 'Test',
          extraMonthlyBudget: 1000,
          strategyId: 'highestRate',
          isPinned: true,
          notes: null,
          sortOrder: 0,
        },
      ],
      { strategyId: 'highestRate', extraMonthlyBudget: 1000 },
      { id: 'base', label: 'Base' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isLive).toBeFalsy();
  });
});
