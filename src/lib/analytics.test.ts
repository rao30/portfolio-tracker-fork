import { describe, expect, it } from 'vitest';
import { computeIrr, computeNpv, equityMultiple } from './analytics';
import type { SimulationResult } from './types';

describe('analytics', () => {
  it('computes IRR for simple cashflows', () => {
    const irr = computeIrr([-100000, 12000, 12000, 12000, 112000]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.05);
  });

  it('computes NPV', () => {
    const npv = computeNpv([-100, 50, 60], 0.1);
    expect(npv).toBeGreaterThan(0);
  });

  it('computes equity multiple', () => {
    const result: SimulationResult = {
      strategy: 'test',
      order: [],
      monthsToPayoff: 2,
      totalInterestPaid: 0,
      totalExtraPaid: 0,
      finalMonthlyCashflow: 0,
      payoffSchedule: {},
      finalEquity: 150000,
      finalNetWorth: 150000,
      history: [
        {
          month: 1,
          totalBalance: 0,
          totalInterestThisMonth: 0,
          totalPrincipalThisMonth: 0,
          totalExtraApplied: 0,
          monthlyCashflow: 5000,
          targetProperty: null,
          paidOffThisMonth: [],
          balancesByName: {},
          valuesByName: {},
          equityByName: {},
          totalEquity: 100000,
          totalPropertyValue: 100000,
          totalLiabilities: 0,
          netWorth: 100000,
          monthlyRent: 0,
          monthlyExpenses: 0,
          monthlyPi: 0,
          monthlyCapex: 0,
          cumulativeRentCollected: 0,
          cumulativeExpenses: 0,
          cashReserveBalance: 0,
          cumulativeCashflowGenerated: 0,
        },
        {
          month: 2,
          totalBalance: 0,
          totalInterestThisMonth: 0,
          totalPrincipalThisMonth: 0,
          totalExtraApplied: 0,
          monthlyCashflow: 5000,
          targetProperty: null,
          paidOffThisMonth: [],
          balancesByName: {},
          valuesByName: {},
          equityByName: {},
          totalEquity: 150000,
          totalPropertyValue: 150000,
          totalLiabilities: 0,
          netWorth: 150000,
          monthlyRent: 0,
          monthlyExpenses: 0,
          monthlyPi: 0,
          monthlyCapex: 0,
          cumulativeRentCollected: 0,
          cumulativeExpenses: 0,
          cashReserveBalance: 0,
          cumulativeCashflowGenerated: 5000,
        },
      ],
    };
    expect(equityMultiple(100000, result)).toBeCloseTo(1.6, 1);
  });
});
