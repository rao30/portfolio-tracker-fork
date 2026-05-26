import { describe, expect, it } from 'vitest';
import {
  bonusDepreciationForYear,
  computeFirstYearDepreciation,
  computePropertyTaxLoss,
  computeTaxPlannerResult,
  computeUsableLoss,
  defaultTaxProfile,
  passiveLossAllowance,
} from './tax';
import { normalizePortfolio } from './snowball';
import type { Property } from './types';

const sampleProperty: Property = {
  name: 'Test',
  balance: 400000,
  marketValue: 550000,
  annualInterestRate: 0.065,
  annualAppreciationRate: 0.03,
  monthlyPayment: 2500,
  monthlyRent: 5500,
  monthlyExpenses: 1650,
  purchasePrice: 550000,
  useCostSeg: true,
  costSegPercent: 0.25,
};

describe('bonusDepreciationForYear', () => {
  it('phases down through 2026', () => {
    expect(bonusDepreciationForYear(2024)).toBe(0.6);
    expect(bonusDepreciationForYear(2026)).toBe(0.2);
    expect(bonusDepreciationForYear(2028)).toBe(0);
  });
});

describe('computeFirstYearDepreciation', () => {
  it('includes bonus and straight-line components', () => {
    const profile = defaultTaxProfile(2026);
    const dep = computeFirstYearDepreciation(sampleProperty, profile);
    expect(dep.buildingBasis).toBeCloseTo(440000, 0);
    expect(dep.bonus).toBeGreaterThan(0);
    expect(dep.straightLine).toBeGreaterThan(0);
    expect(dep.total).toBeGreaterThan(dep.straightLine);
  });

  it('skips cost seg when disabled', () => {
    const profile = defaultTaxProfile(2026);
    const dep = computeFirstYearDepreciation(
      { ...sampleProperty, useCostSeg: false, costSegPercent: 0 },
      profile,
    );
    expect(dep.bonus).toBe(0);
    expect(dep.costSegPortion).toBe(0);
  });
});

describe('computePropertyTaxLoss', () => {
  it('produces positive paper loss for leveraged rental', () => {
    const profile = defaultTaxProfile(2026);
    const loss = computePropertyTaxLoss(sampleProperty, profile);
    expect(loss.netTaxableLoss).toBeGreaterThan(0);
  });
});

describe('passiveLossAllowance', () => {
  it('phases out above 150k AGI', () => {
    expect(passiveLossAllowance(90000)).toBe(25000);
    expect(passiveLossAllowance(125000)).toBe(12500);
    expect(passiveLossAllowance(160000)).toBe(0);
  });
});

describe('computeUsableLoss', () => {
  it('allows full offset with REPS', () => {
    const profile = { ...defaultTaxProfile(2026), annualW2Income: 100000, spouseIsReps: true };
    const { usable, carryforward } = computeUsableLoss(120000, profile);
    expect(usable).toBe(100000);
    expect(carryforward).toBe(20000);
  });

  it('limits without REPS', () => {
    const profile = { ...defaultTaxProfile(2026), annualW2Income: 90000, spouseIsReps: false };
    const { usable, carryforward } = computeUsableLoss(80000, profile);
    expect(usable).toBe(25000);
    expect(carryforward).toBe(55000);
  });
});

describe('computeTaxPlannerResult', () => {
  it('computes properties to buy for W2 offset', () => {
    const portfolio = normalizePortfolio({
      extra_monthly_budget: 5000,
      default_capex_reserve_rate: 0.1,
      tax_profile: {
        annual_w2_income: 400000,
        spouse_is_reps: true,
        marginal_tax_rate: 0.32,
        tax_year: 2026,
      },
      properties: [
        {
          name: 'Test',
          balance: 400000,
          market_value: 550000,
          annual_interest_rate: 0.065,
          monthly_payment: 2500,
          monthly_rent: 5500,
          monthly_expenses: 1650,
          purchase_price: 550000,
          use_cost_seg: true,
        },
      ],
    });
    const result = computeTaxPlannerResult(portfolio);
    expect(result.totalExistingLoss).toBeGreaterThan(0);
    expect(result.strategies.length).toBe(3);
    if (result.gapToWipeW2 > 0) {
      expect(result.propertiesToBuy).toBeGreaterThan(0);
    }
  });
});
