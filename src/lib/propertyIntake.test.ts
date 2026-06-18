import { describe, expect, it } from 'vitest';
import type { Portfolio, Property } from './types';
import {
  buildIntakeDraft,
  canAdvanceFromStep,
  computeAutoPayment,
  draftFromAcquisitionTemplate,
  intakeDraftToProperty,
  validateIntakeStep,
  withAutoPayment,
} from './propertyIntake';

const basePortfolio: Portfolio = {
  extraMonthlyBudget: 5000,
  annualRentGrowthRate: 0.02,
  annualExpenseInflationRate: 0.015,
  reinvestSurplus: false,
  monthlyReserveTarget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.05,
  defaultCapexReserveFlat: 0,
  taxProfile: {
    annualW2Income: 350000,
    spouseIsReps: true,
    marginalTaxRate: 0.32,
    taxYear: 2026,
    bonusDepreciationRate: 1,
    remainingBonusCarryover: 0,
    stateTaxRate: 0,
  },
  acquisitionTemplate: {
    label: 'Duplex',
    purchasePrice: 400000,
    downPaymentPercent: 0.2,
    annualInterestRate: 0.065,
    loanTermMonths: 360,
    monthlyRent: 3200,
    monthlyExpenses: 900,
    landPercent: 0.2,
    costSegPercent: 0.3,
    useCostSeg: true,
  },
  goals: [],
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  defaultRefiAnnualRate: 0.0675,
  defaultRefiTermMonths: 360,
  properties: [],
};

const sampleProperty: Property = {
  name: 'Test Duplex',
  balance: 300000,
  marketValue: 400000,
  annualInterestRate: 0.06,
  annualAppreciationRate: 0.03,
  monthlyPayment: 1798.65,
  monthlyRent: 3200,
  monthlyExpenses: 900,
  financingType: 'conventional',
};

describe('propertyIntake', () => {
  it('builds draft from acquisition template', () => {
    const draft = draftFromAcquisitionTemplate(
      basePortfolio.acquisitionTemplate,
      basePortfolio,
    );
    expect(draft.marketValue).toBe(400000);
    expect(draft.balance).toBeCloseTo(320000, 0);
    expect(draft.monthlyRent).toBe(3200);
  });

  it('auto-calculates monthly payment', () => {
    const draft = buildIntakeDraft('acquisition', basePortfolio);
    const payment = computeAutoPayment(draft);
    expect(payment).toBeGreaterThan(0);
    expect(withAutoPayment(draft).monthlyPayment).toBe(payment);
  });

  it('validates identity step', () => {
    const draft = buildIntakeDraft('blank', basePortfolio);
    expect(validateIntakeStep('identity', draft).ok).toBe(false);
    draft.name = 'New Property';
    expect(validateIntakeStep('identity', { ...draft, name: 'New Property' }).ok).toBe(true);
  });

  it('converts draft to property with financing metadata', () => {
    const draft = buildIntakeDraft('clone_last', basePortfolio, sampleProperty);
    draft.name = 'Cloned Duplex';
    draft.financingType = 'seller';
    const property = intakeDraftToProperty(draft);
    expect(property.name).toBe('Cloned Duplex');
    expect(property.financingType).toBe('seller');
    expect(property.balloonMonths).toBe(60);
    expect(property.monthlyPayment).toBeGreaterThan(0);
  });

  it('blocks advance when loan fields invalid', () => {
    const draft = buildIntakeDraft('blank', basePortfolio);
    draft.name = 'Incomplete';
    expect(canAdvanceFromStep('loan', draft)).toBe(false);
    draft.balance = 250000;
    draft.marketValue = 350000;
    draft.monthlyPayment = 1500;
    draft.autoCalculatePayment = false;
    expect(canAdvanceFromStep('loan', draft)).toBe(true);
  });
});
