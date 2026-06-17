import { describe, expect, it } from 'vitest';
import type { Property } from './types';
import {
  applyFinancingPatch,
  buildFinancingPreview,
  deriveTermsFromPayoffCap,
  monthsUntilBalloon,
  resolveFinancingType,
  validatePropertyFinancing,
} from './propertyFinancing';

const baseProperty: Property = {
  name: 'Test Duplex',
  balance: 200_000,
  marketValue: 250_000,
  annualInterestRate: 0.07,
  annualAppreciationRate: 0.03,
  monthlyPayment: 1_400,
  monthlyRent: 2_200,
  monthlyExpenses: 400,
  closeMonth: 1,
};

const basePortfolio = {
  extraMonthlyBudget: 0,
  annualRentGrowthRate: 0.03,
  annualExpenseInflationRate: 0.03,
  reinvestSurplus: false,
  monthlyReserveTarget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.05,
  defaultCapexReserveFlat: 0,
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  taxProfile: { taxYear: 2026, bonusDepreciationRate: 0 },
  acquisitionTemplate: {
    annualInterestRate: 0.065,
    annualAppreciationRate: 0.03,
    vacancyRate: 0.05,
    capexReserveRate: 0.05,
  },
  goals: [],
  properties: [baseProperty],
  defaultRefiAnnualRate: 0.065,
  defaultRefiTermMonths: 360,
};

describe('propertyFinancing', () => {
  it('detects seller financing from balloon fields', () => {
    expect(resolveFinancingType({ ...baseProperty, balloonMonths: 60 })).toBe('seller');
    expect(resolveFinancingType({ ...baseProperty, financingType: 'conventional' })).toBe(
      'conventional',
    );
  });

  it('computes months until balloon', () => {
    const seller = {
      ...baseProperty,
      financingType: 'seller' as const,
      balloonMonths: 24,
      closeMonth: 1,
    };
    expect(monthsUntilBalloon(seller, 1)).toBe(24);
    expect(monthsUntilBalloon(seller, 25)).toBe(null);
  });

  it('flags yield-maintenance cap violations', () => {
    const seller = {
      ...baseProperty,
      financingType: 'seller' as const,
      balloonMonths: 60,
      sellerPayoffCap: 50_000,
      monthlyPayment: 1_000,
    };
    const issues = validatePropertyFinancing(seller);
    expect(issues.some((i) => i.severity === 'error' && i.field === 'sellerPayoffCap')).toBe(true);
  });

  it('builds critical urgency when balloon is imminent', () => {
    const seller = {
      ...baseProperty,
      financingType: 'seller' as const,
      balloonMonths: 6,
      closeMonth: 1,
    };
    const preview = buildFinancingPreview(seller, basePortfolio, 1);
    expect(preview.urgency).toBe('critical');
    expect(preview.monthsUntilBalloon).toBe(6);
  });

  it('derives principal and payment from payoff cap', () => {
    const seller = {
      ...baseProperty,
      financingType: 'seller' as const,
      sellerPayoffCap: 440_000,
      annualInterestRate: 0.06,
      balloonMonths: 60,
      sellerAmortizationMonths: 240,
    };
    const terms = deriveTermsFromPayoffCap(seller);
    expect(terms).not.toBeNull();
    expect(terms!.balance).toBeGreaterThan(0);
    expect(terms!.monthlyPayment).toBeGreaterThan(0);
    expect(terms!.balloonBalance).toBeGreaterThan(0);
  });

  it('clears seller fields when switching to conventional', () => {
    const seller = {
      ...baseProperty,
      financingType: 'seller' as const,
      balloonMonths: 60,
      sellerPayoffCap: 400_000,
    };
    const next = applyFinancingPatch(seller, { financingType: 'conventional' });
    expect(next.balloonMonths).toBeUndefined();
    expect(next.sellerPayoffCap).toBeUndefined();
  });
});
