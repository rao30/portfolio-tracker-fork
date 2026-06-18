import { describe, expect, it } from 'vitest';
import { normalizePortfolio } from './snowball';
import { defaultTaxProfile } from './tax';
import {
  buildPreviewTaxProfile,
  computeTaxShieldAnalysis,
  computeTaxShieldPreviewDelta,
  extractDirtyPatch,
  taxProfilePatchIsDirty,
} from './taxShield';

describe('computeTaxShieldAnalysis', () => {
  it('reports positive tone when REPS unlocks usable loss', () => {
    const portfolio = normalizePortfolio({
      extra_monthly_budget: 0,
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
          close_year: 2024,
          use_cost_seg: true,
        },
      ],
      tax_profile: {
        ...defaultTaxProfile(2026),
        annual_w2_income: 350000,
        spouse_is_reps: true,
      },
    });

    const analysis = computeTaxShieldAnalysis(portfolio);
    expect(analysis.totalTaxShield).toBeGreaterThan(0);
    expect(analysis.usableLoss).toBeGreaterThan(0);
    expect(analysis.statusTone).toBe('positive');
  });

  it('shows caution when passive rules suspend losses', () => {
    const portfolio = normalizePortfolio({
      extra_monthly_budget: 0,
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
          close_year: 2024,
          use_cost_seg: true,
        },
      ],
      tax_profile: {
        ...defaultTaxProfile(2026),
        annual_w2_income: 200000,
        spouse_is_reps: false,
      },
    });

    const analysis = computeTaxShieldAnalysis(portfolio);
    expect(analysis.withoutRepsCarryforward).toBeGreaterThan(0);
    expect(analysis.statusTone).toBe('caution');
  });
});

describe('tax shield preview', () => {
  it('detects dirty W2 preview and computes delta', () => {
    const portfolio = normalizePortfolio({
      extra_monthly_budget: 0,
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
          close_year: 2024,
        },
      ],
      tax_profile: defaultTaxProfile(2026),
    });

    const committed = portfolio.taxProfile;
    const preview = buildPreviewTaxProfile(committed, { annualW2Income: 500_000 });
    expect(taxProfilePatchIsDirty(committed, preview)).toBe(true);

    const patch = extractDirtyPatch(committed, preview);
    expect(patch.annualW2Income).toBe(500_000);

    const delta = computeTaxShieldPreviewDelta(portfolio, committed, preview);
    expect(delta.w2LabelPreview).toContain('500');
  });
});
