import { describe, expect, it } from 'vitest';
import type { Portfolio } from './types';
import {
  collectTimelineEvents,
  computeEventsImpact,
  countLifeEvents,
  createDefaultEvent,
  portfolioWithoutLifeEvents,
  validatePropertyEvent,
} from './timeline';

const miniPortfolio: Portfolio = {
  seedVersion: 1,
  extraMonthlyBudget: 1000,
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  defaultRefiAnnualRate: 0.065,
  defaultRefiTermMonths: 360,
  annualRentGrowthRate: 0.03,
  annualExpenseInflationRate: 0.02,
  reinvestSurplus: true,
  monthlyReserveTarget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.1,
  defaultCapexReserveFlat: 0,
  taxProfile: {
    w2Income: 100_000,
    spouseIsReps: false,
    marginalTaxRate: 0.24,
    bonusCarryover: 0,
  },
  acquisitionTemplate: {
    annualAppreciationRate: 0.03,
    annualRentGrowthRate: 0.03,
    vacancyRate: 0.05,
    capexReserveRate: 0.1,
    landPercent: 0.2,
    useCostSeg: false,
  },
  goals: [],
  properties: [
    {
      name: 'Test A',
      balance: 200_000,
      marketValue: 300_000,
      annualInterestRate: 0.07,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1400,
      monthlyRent: 2200,
      monthlyExpenses: 400,
      events: [{ month: 24, type: 'rentChange', rent: 2500 }],
    },
    {
      name: 'Test B',
      balance: 150_000,
      marketValue: 220_000,
      annualInterestRate: 0.065,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1000,
      monthlyRent: 1800,
      monthlyExpenses: 300,
      events: [{ month: 12, type: 'capexSpike', amount: 5000 }],
    },
  ],
};

describe('timeline', () => {
  it('collects and sorts events across properties', () => {
    const rows = collectTimelineEvents(miniPortfolio);
    expect(rows).toHaveLength(2);
    expect(rows[0].simMonth).toBe(12);
    expect(rows[1].simMonth).toBe(24);
  });

  it('strips events for baseline comparison', () => {
    expect(countLifeEvents(miniPortfolio)).toBe(2);
    const stripped = portfolioWithoutLifeEvents(miniPortfolio);
    expect(countLifeEvents(stripped)).toBe(0);
  });

  it('computes impact delta when events exist', () => {
    const impact = computeEventsImpact(miniPortfolio, 'highestRate');
    expect(impact.hasEvents).toBe(true);
    expect(impact.withEvents.monthsToPayoff).toBeGreaterThan(0);
    expect(impact.withoutEvents.monthsToPayoff).toBeGreaterThan(0);
  });

  it('validates event fields', () => {
    expect(validatePropertyEvent(createDefaultEvent('rentChange', 24))).toBeNull();
    expect(validatePropertyEvent({ month: 0, type: 'rentChange', rent: 1000 })).not.toBeNull();
    expect(validatePropertyEvent({ month: 12, type: 'capexSpike', amount: -1 })).not.toBeNull();
  });
});
