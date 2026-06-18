import type { FinancingType, PropertyFinancingPatch } from './propertyFinancing';

export type SellerFinancingEntryMode = 'cap_driven' | 'balance_driven';

export type SellerFinancingPresetId =
  | 'yield_maintenance_5yr'
  | 'yield_maintenance_7yr'
  | 'short_balloon_3yr'
  | 'long_balloon_10yr';

export type SellerFinancingStatusTone = 'positive' | 'neutral' | 'caution';

export interface SellerFinancingPreferences {
  isCollapsed: boolean;
  focusedPropertyIndex: number;
  entryMode: SellerFinancingEntryMode;
  lastExploredPreset: SellerFinancingPresetId | null;
  showAmortizationChart: boolean;
  showRefiImpact: boolean;
  updatedAt: string;
}

export interface SellerFinancingPreset {
  id: SellerFinancingPresetId;
  label: string;
  description: string;
  balloonMonths: number;
  sellerAmortizationMonths: number;
}

export interface SellerFinancingAnalysis {
  financingType: FinancingType;
  statusHeadline: string;
  statusDetail: string;
  statusTone: SellerFinancingStatusTone;
  monthsUntilBalloon: number | null;
  balloonBalanceEstimate: number | null;
  refiPaymentEstimate: number | null;
  aggregatePiAtBalloon: number | null;
  monthlyPayment: number;
  balance: number;
  issueCount: number;
  errorCount: number;
}

export interface SellerFinancingPreviewDelta {
  balloonBalanceDelta: number | null;
  refiPaymentDelta: number | null;
  monthlyPaymentDelta: number | null;
  balanceDelta: number | null;
  monthsUntilBalloonDelta: number | null;
}

export type SellerFinancingPreviewField = keyof PropertyFinancingPatch;
