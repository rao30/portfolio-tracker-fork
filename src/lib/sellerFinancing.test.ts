import { describe, expect, it } from 'vitest';
import type { Property } from './types';
import {
  applyPresetPatch,
  buildPreviewProperty,
  computeSellerFinancingAnalysis,
  computeSellerFinancingPreviewDelta,
  extractDirtyFinancingPatch,
  financingPatchIsDirty,
  presetById,
  SELLER_FINANCING_PRESETS,
} from './sellerFinancing';

const baseProperty: Property = {
  name: 'Test Prop',
  balance: 300_000,
  monthlyPayment: 2_000,
  annualInterestRate: 0.06,
  grossMonthlyRent: 3_500,
  monthlyExpenses: 800,
  marketValue: 400_000,
  closeMonth: 1,
};

const portfolio = {
  properties: [baseProperty],
  extraMonthlyBudget: 500,
  defaultRefiAnnualRate: 0.065,
  defaultRefiTermMonths: 360,
  taxProfile: { annualW2Income: 200_000, marginalTaxRate: 0.32, spouseIsReps: true },
};

describe('sellerFinancing', () => {
  it('lists four note-structure presets', () => {
    expect(SELLER_FINANCING_PRESETS).toHaveLength(4);
    expect(presetById('yield_maintenance_5yr').balloonMonths).toBe(60);
  });

  it('detects dirty financing patch', () => {
    const preview = buildPreviewProperty(baseProperty, { financingType: 'seller', balloonMonths: 60 });
    expect(financingPatchIsDirty(baseProperty, preview)).toBe(true);
    const patch = extractDirtyFinancingPatch(baseProperty, preview);
    expect(patch.financingType).toBe('seller');
    expect(patch.balloonMonths).toBe(60);
  });

  it('analyzes conventional financing', () => {
    const analysis = computeSellerFinancingAnalysis(baseProperty, portfolio, 12);
    expect(analysis.financingType).toBe('conventional');
    expect(analysis.statusHeadline).toContain('Conventional');
  });

  it('analyzes seller note with balloon urgency', () => {
    const seller: Property = {
      ...baseProperty,
      financingType: 'seller',
      balloonMonths: 18,
      sellerAmortizationMonths: 240,
      sellerPayoffCap: 360_000,
    };
    const analysis = computeSellerFinancingAnalysis(seller, portfolio, 12);
    expect(analysis.financingType).toBe('seller');
    expect(analysis.statusTone).toBe('caution');
    expect(analysis.monthsUntilBalloon).toBe(7);
  });

  it('computes preview delta for payoff cap change', () => {
    const committed: Property = {
      ...baseProperty,
      financingType: 'seller',
      balloonMonths: 60,
      sellerAmortizationMonths: 240,
      sellerPayoffCap: 400_000,
    };
    const preview = buildPreviewProperty(committed, { sellerPayoffCap: 440_000 });
    const delta = computeSellerFinancingPreviewDelta(committed, preview, portfolio, 12);
    expect(delta.refiPaymentDelta).not.toBeNull();
  });

  it('applies preset and derives terms from payoff cap', () => {
    const seller: Property = {
      ...baseProperty,
      financingType: 'seller',
      sellerPayoffCap: 440_000,
      balloonMonths: 60,
      sellerAmortizationMonths: 240,
    };
    const patch = applyPresetPatch('short_balloon_3yr', seller);
    expect(patch.balloonMonths).toBe(36);
    expect(patch.monthlyPayment).toBeGreaterThan(0);
  });
});
