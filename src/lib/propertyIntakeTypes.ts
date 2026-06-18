export type IntakeStep = 'template' | 'identity' | 'loan' | 'income' | 'review';

export type IntakeTemplateSource = 'clone_last' | 'acquisition' | 'blank';

export type IntakeFinancingType = 'conventional' | 'seller';

export interface PropertyIntakeDraft {
  name: string;
  address: string;
  acquisitionDate: string;
  financingType: IntakeFinancingType;
  balance: number;
  marketValue: number;
  annualInterestRate: number;
  annualAppreciationRate: number;
  monthlyPayment: number;
  loanTermMonths: number;
  autoCalculatePayment: boolean;
  monthlyRent: number;
  monthlyExpenses: number;
  monthlyUtilities: number;
  purchasePrice: number;
  balloonMonths: number;
  sellerAmortizationMonths: number;
}

export interface PropertyIntakePreferences {
  isCollapsed: boolean;
  preferredTemplate: IntakeTemplateSource;
  defaultFinancingType: IntakeFinancingType;
  lastCompletedStep: IntakeStep;
  autoCalculatePayment: boolean;
  updatedAt: string;
}

export interface IntakeStepValidation {
  ok: boolean;
  errors: Partial<Record<keyof PropertyIntakeDraft | 'general', string>>;
}
