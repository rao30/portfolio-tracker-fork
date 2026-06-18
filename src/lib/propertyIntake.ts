import type { AcquisitionTemplate, Portfolio, Property } from './types';
import { paymentFromPrincipal } from './snowball';
import { buildPropertyHealth } from './propertyHealth';
import type {
  IntakeFinancingType,
  IntakeStep,
  IntakeTemplateSource,
  PropertyIntakeDraft,
  IntakeStepValidation,
} from './propertyIntakeTypes';

export const INTAKE_STEPS: IntakeStep[] = [
  'template',
  'identity',
  'loan',
  'income',
  'review',
];

export const INTAKE_STEP_LABELS: Record<IntakeStep, string> = {
  template: 'Start',
  identity: 'Identity',
  loan: 'Loan',
  income: 'Income',
  review: 'Review',
};

const DEFAULT_DRAFT: PropertyIntakeDraft = {
  name: '',
  address: '',
  acquisitionDate: '',
  financingType: 'conventional',
  balance: 0,
  marketValue: 0,
  annualInterestRate: 0.065,
  annualAppreciationRate: 0.03,
  monthlyPayment: 0,
  loanTermMonths: 360,
  autoCalculatePayment: true,
  monthlyRent: 0,
  monthlyExpenses: 0,
  monthlyUtilities: 0,
  purchasePrice: 0,
  balloonMonths: 60,
  sellerAmortizationMonths: 240,
};

export function emptyIntakeDraft(
  overrides?: Partial<PropertyIntakeDraft>,
): PropertyIntakeDraft {
  return { ...DEFAULT_DRAFT, ...overrides };
}

export function draftFromProperty(
  property: Property,
  financingType: IntakeFinancingType = 'conventional',
): PropertyIntakeDraft {
  return {
    name: '',
    address: property.address ?? '',
    acquisitionDate: property.acquisitionDate ?? '',
    financingType: property.financingType ?? financingType,
    balance: property.balance,
    marketValue: property.marketValue,
    annualInterestRate: property.annualInterestRate,
    annualAppreciationRate: property.annualAppreciationRate,
    monthlyPayment: property.monthlyPayment,
    loanTermMonths: property.remainingTermMonths ?? 360,
    autoCalculatePayment: true,
    monthlyRent: property.monthlyRent,
    monthlyExpenses: property.monthlyExpenses,
    monthlyUtilities: property.monthlyUtilities ?? 0,
    purchasePrice: property.purchasePrice ?? property.marketValue,
    balloonMonths: property.balloonMonths ?? 60,
    sellerAmortizationMonths: property.sellerAmortizationMonths ?? 240,
  };
}

export function draftFromAcquisitionTemplate(
  template: AcquisitionTemplate,
  portfolio: Portfolio,
  financingType: IntakeFinancingType = 'conventional',
): PropertyIntakeDraft {
  const loanAmount = template.purchasePrice * (1 - template.downPaymentPercent);
  const monthlyPayment = paymentFromPrincipal(
    loanAmount,
    template.annualInterestRate,
    template.loanTermMonths,
  );

  return {
    name: '',
    address: '',
    acquisitionDate: `${portfolio.taxProfile.taxYear}-${portfolio.simulationAnchorMonth}`,
    financingType,
    balance: loanAmount,
    marketValue: template.purchasePrice,
    annualInterestRate: template.annualInterestRate,
    annualAppreciationRate: 0.03,
    monthlyPayment,
    loanTermMonths: template.loanTermMonths,
    autoCalculatePayment: true,
    monthlyRent: template.monthlyRent,
    monthlyExpenses: template.monthlyExpenses,
    monthlyUtilities: 0,
    purchasePrice: template.purchasePrice,
    balloonMonths: 60,
    sellerAmortizationMonths: 240,
  };
}

export function buildIntakeDraft(
  source: IntakeTemplateSource,
  portfolio: Portfolio,
  lastProperty?: Property,
  financingType: IntakeFinancingType = 'conventional',
): PropertyIntakeDraft {
  if (source === 'blank') return emptyIntakeDraft({ financingType });
  if (source === 'acquisition') {
    return draftFromAcquisitionTemplate(
      portfolio.acquisitionTemplate,
      portfolio,
      financingType,
    );
  }
  if (lastProperty) return draftFromProperty(lastProperty, financingType);
  return draftFromAcquisitionTemplate(
    portfolio.acquisitionTemplate,
    portfolio,
    financingType,
  );
}

export function computeAutoPayment(draft: PropertyIntakeDraft): number {
  const term =
    draft.financingType === 'seller'
      ? draft.sellerAmortizationMonths
      : draft.loanTermMonths;
  return paymentFromPrincipal(draft.balance, draft.annualInterestRate, term);
}

export function withAutoPayment(draft: PropertyIntakeDraft): PropertyIntakeDraft {
  if (!draft.autoCalculatePayment) return draft;
  return { ...draft, monthlyPayment: computeAutoPayment(draft) };
}

export function intakeDraftToProperty(draft: PropertyIntakeDraft): Property {
  const resolved = withAutoPayment(draft);
  const property: Property = {
    name: resolved.name.trim(),
    balance: resolved.balance,
    marketValue: resolved.marketValue,
    annualInterestRate: resolved.annualInterestRate,
    annualAppreciationRate: resolved.annualAppreciationRate,
    monthlyPayment: resolved.monthlyPayment,
    monthlyRent: resolved.monthlyRent,
    monthlyExpenses: resolved.monthlyExpenses,
    financingType: resolved.financingType,
  };

  if (resolved.address.trim()) property.address = resolved.address.trim();
  if (resolved.acquisitionDate.trim()) {
    property.acquisitionDate = resolved.acquisitionDate.trim();
    const match = resolved.acquisitionDate.trim().match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      property.closeYear = Number(match[1]);
      property.closeMonthCalendar = Number(match[2]);
    }
  }
  if (resolved.monthlyUtilities > 0) {
    property.monthlyUtilities = resolved.monthlyUtilities;
  }
  if (resolved.purchasePrice > 0) {
    property.purchasePrice = resolved.purchasePrice;
  }
  if (resolved.financingType === 'seller') {
    property.balloonMonths = resolved.balloonMonths;
    property.sellerAmortizationMonths = resolved.sellerAmortizationMonths;
    property.balloonRefiAnnualRate = 0.0675;
    property.balloonRefiTermMonths = 360;
  }
  if (resolved.loanTermMonths > 0 && resolved.financingType === 'conventional') {
    property.remainingTermMonths = resolved.loanTermMonths;
  }

  return property;
}

export function validateIntakeStep(
  step: IntakeStep,
  draft: PropertyIntakeDraft,
): IntakeStepValidation {
  const errors: IntakeStepValidation['errors'] = {};

  if (step === 'identity' || step === 'review') {
    if (!draft.name.trim()) errors.name = 'Property name is required';
    if (draft.name.trim().length > 120) errors.name = 'Name must be 120 characters or less';
    if (draft.acquisitionDate.trim()) {
      if (!/^\d{4}-\d{1,2}$/.test(draft.acquisitionDate.trim())) {
        errors.acquisitionDate = 'Use YYYY-M format (e.g. 2024-6)';
      } else {
        const [, month] = draft.acquisitionDate.trim().split('-').map(Number);
        if (month < 1 || month > 12) errors.acquisitionDate = 'Month must be 1–12';
      }
    }
  }

  if (step === 'loan' || step === 'review') {
    if (draft.balance <= 0) errors.balance = 'Loan balance must be greater than zero';
    if (draft.marketValue <= 0) errors.marketValue = 'Market value must be greater than zero';
    if (draft.annualInterestRate < 0 || draft.annualInterestRate > 0.25) {
      errors.annualInterestRate = 'Rate must be between 0% and 25%';
    }
    const payment = draft.autoCalculatePayment
      ? computeAutoPayment(draft)
      : draft.monthlyPayment;
    if (draft.balance > 0 && payment <= 0) {
      errors.monthlyPayment = 'Monthly P&I is required for leveraged properties';
    }
    if (draft.financingType === 'seller') {
      if (draft.balloonMonths < 12 || draft.balloonMonths > 360) {
        errors.balloonMonths = 'Balloon term must be 12–360 months';
      }
    }
  }

  if (step === 'income' || step === 'review') {
    if (draft.monthlyRent < 0) errors.monthlyRent = 'Rent cannot be negative';
    if (draft.monthlyExpenses < 0) errors.monthlyExpenses = 'Expenses cannot be negative';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function canAdvanceFromStep(step: IntakeStep, draft: PropertyIntakeDraft): boolean {
  if (step === 'template') return true;
  return validateIntakeStep(step, draft).ok;
}

export function nextIntakeStep(step: IntakeStep): IntakeStep | null {
  const idx = INTAKE_STEPS.indexOf(step);
  if (idx < 0 || idx >= INTAKE_STEPS.length - 1) return null;
  return INTAKE_STEPS[idx + 1];
}

export function prevIntakeStep(step: IntakeStep): IntakeStep | null {
  const idx = INTAKE_STEPS.indexOf(step);
  if (idx <= 0) return null;
  return INTAKE_STEPS[idx - 1];
}

export function computeIntakePreview(draft: PropertyIntakeDraft, portfolio: Portfolio) {
  const property = intakeDraftToProperty(draft);
  const health = buildPropertyHealth(property, portfolio);
  const ltv = property.marketValue > 0 ? property.balance / property.marketValue : 0;
  const capRate =
    property.marketValue > 0
      ? ((property.monthlyRent * (1 - (portfolio.defaultVacancyRate ?? 0.05)) -
          property.monthlyExpenses) *
          12) /
        property.marketValue
      : 0;

  return {
    property,
    health,
    ltv,
    capRate,
  };
}
