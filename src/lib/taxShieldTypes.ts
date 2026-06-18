import type { TaxProfile } from './types';

export type TaxShieldStatusTone = 'positive' | 'neutral' | 'caution';

export interface TaxShieldPreferences {
  isCollapsed: boolean;
  lastExploredW2Income: number | null;
  lastExploredCarryover: number | null;
  incomeStep: number;
  showPropertyBreakdown: boolean;
  updatedAt: string;
}

export interface TaxShieldAnalysis {
  taxYear: number;
  statusHeadline: string;
  statusDetail: string;
  statusTone: TaxShieldStatusTone;
  totalTaxShield: number;
  totalTaxSavings: number;
  usableLoss: number;
  carryforwardLoss: number;
  remainingTaxableIncome: number;
  shieldPercentOfW2: number;
  repsDeltaSavings: number;
  withoutRepsUsableLoss: number;
  withoutRepsCarryforward: number;
  propertyCount: number;
  newAcquisitionCount: number;
}

export interface TaxShieldPreviewDelta {
  shieldDelta: number;
  savingsDelta: number;
  usableDelta: number;
  carryforwardDelta: number;
  remainingIncomeDelta: number;
  w2LabelCommitted: string;
  w2LabelPreview: string;
}

export type TaxShieldPreviewField = keyof Pick<
  TaxProfile,
  | 'annualW2Income'
  | 'remainingBonusCarryover'
  | 'marginalTaxRate'
  | 'spouseIsReps'
  | 'stateTaxRate'
>;

export interface TaxShieldPreviewPatch {
  annualW2Income?: number;
  remainingBonusCarryover?: number;
  marginalTaxRate?: number;
  spouseIsReps?: boolean;
  stateTaxRate?: number;
}
