import { describe, expect, it } from 'vitest';
import {
  bonusDepreciationForYear,
  classifyPropertyForTaxYear,
  computeFirstYearDepreciation,
  computeOngoingAnnualDepreciation,
  computePropertyTaxLossForYear,
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
  it('is 100% for 2025+ under renewed bonus depreciation', () => {
    expect(bonusDepreciationForYear(2025)).toBe(1);
    expect(bonusDepreciationForYear(2026)).toBe(1);
  });

  it('phases down before renewal', () => {
    expect(bonusDepreciationForYear(2024)).toBe(0.6);
  });
});

describe('classifyPropertyForTaxYear', () => {
  it('classifies held, new, and future', () => {
    expect(classifyPropertyForTaxYear({ ...sampleProperty, name: 'A' }, 2026)).toBe(
      'held',
    );
    expect(
      classifyPropertyForTaxYear({ ...sampleProperty, name: 'B', closeYear: 2026 }, 2026),
    ).toBe('newAcquisition');
    expect(
      classifyPropertyForTaxYear({ ...sampleProperty, name: 'C', closeYear: 2027 }, 2026),
    ).toBe('future');
  });
});

describe('computeFirstYearDepreciation', () => {
  it('includes bonus for new acquisitions', () => {
    const profile = defaultTaxProfile(2026);
    const dep = computeFirstYearDepreciation(sampleProperty, profile);
    expect(dep.bonus).toBeGreaterThan(0);
    expect(dep.total).toBeGreaterThan(dep.straightLine);
  });
});

describe('computeOngoingAnnualDepreciation', () => {
  it('has no bonus for held properties', () => {
    const dep = computeOngoingAnnualDepreciation(sampleProperty, 2026);
    expect(dep.bonus).toBe(0);
    expect(dep.total).toBeGreaterThan(0);
  });
});

describe('computePropertyTaxLossForYear', () => {
  it('returns null for future acquisitions', () => {
    const profile = defaultTaxProfile(2026);
    const loss = computePropertyTaxLossForYear(
      { ...sampleProperty, closeYear: 2028 },
      profile,
    );
    expect(loss).toBeNull();
  });
});

describe('passiveLossAllowance', () => {
  it('phases out above 150k AGI', () => {
    expect(passiveLossAllowance(90000)).toBe(25000);
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
});

describe('computeTaxPlannerResult', () => {
  it('includes bonus carryover in total shield', () => {
    const portfolio = normalizePortfolio({
      extra_monthly_budget: 5000,
      default_capex_reserve_rate: 0.1,
      tax_profile: {
        annual_w2_income: 400000,
        spouse_is_reps: true,
        marginal_tax_rate: 0.32,
        tax_year: 2026,
        remaining_bonus_carryover: 250000,
      },
      properties: [
        {
          name: 'Held',
          balance: 400000,
          market_value: 550000,
          annual_interest_rate: 0.065,
          monthly_payment: 2500,
          monthly_rent: 5500,
          monthly_expenses: 1650,
          purchase_price: 550000,
          use_cost_seg: true,
        },
        {
          name: 'New 2026',
          balance: 360000,
          market_value: 360000,
          annual_interest_rate: 0.065,
          monthly_payment: 2300,
          monthly_rent: 3600,
          monthly_expenses: 1080,
          purchase_price: 360000,
          close_year: 2026,
          use_cost_seg: true,
        },
        {
          name: 'Future',
          balance: 360000,
          market_value: 360000,
          annual_interest_rate: 0.065,
          monthly_payment: 2300,
          monthly_rent: 3600,
          monthly_expenses: 1080,
          close_year: 2027,
        },
      ],
    });
    const result = computeTaxPlannerResult(portfolio);
    expect(result.heldProperties.length).toBe(1);
    expect(result.newAcquisitions.length).toBe(1);
    expect(result.excludedFuture).toContain('Future');
    expect(result.remainingBonusCarryover).toBe(250000);
    expect(result.totalTaxLoss).toBeGreaterThanOrEqual(250000);
    expect(result.newAcquisitions[0].depreciation.bonus).toBeGreaterThan(0);
    expect(result.heldProperties[0].depreciation.bonus).toBe(0);
  });
});
