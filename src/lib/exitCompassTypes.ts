export type ExitAnalysisMode = 'hold' | 'sell' | 'exchange' | 'all';

export type ExitPathId = 'hold' | 'sell' | 'exchange';

export type ExitVerdict = 'hold' | 'sell' | 'exchange' | 'review';

export type ExitVerdictTone = 'positive' | 'neutral' | 'caution';

export interface ExitCompassPreferences {
  isCollapsed: boolean;
  pinnedProperty: string | null;
  analysisMode: ExitAnalysisMode;
  sellAtMonth: number;
  closingCostPct: number;
  capitalGainsRate: number;
  recaptureRate: number;
  holdHorizonMonths: number;
  proceedsToDebtPct: number;
  showTaxBreakdown: boolean;
  updatedAt: string;
}

export interface ExitCompassAssumptions {
  sellAtMonth: number;
  closingCostPct: number;
  capitalGainsRate: number;
  recaptureRate: number;
  holdHorizonMonths: number;
  proceedsToDebtPct: number;
  analysisMode: ExitAnalysisMode;
}

export interface ExitTaxBreakdown {
  grossEquity: number;
  closingCosts: number;
  estimatedGain: number;
  capitalGainsTax: number;
  recaptureTax: number;
  totalTax: number;
  netProceeds: number;
  toDebt: number;
  toCash: number;
}

export interface ExitPathOutcome {
  pathId: ExitPathId;
  label: string;
  wealthAtHorizon: number;
  cumulativeCashflow: number;
  totalWealth: number;
  monthsToDebtFree: number;
  interestPaid: number;
  netProceeds: number | null;
  taxBreakdown: ExitTaxBreakdown | null;
  headline: string;
}

export interface PropertyExitAnalysis {
  propertyName: string;
  equity: number;
  monthlyCashflow: number;
  roe: number;
  keepScore: number;
  recommendation: ExitVerdict;
  winningPath: ExitPathId;
  paths: ExitPathOutcome[];
  snowballBoost: {
    monthsSavedVsHold: number;
    interestSavedVsHold: number;
  };
  headline: string;
  subline: string;
}

export interface ExitCompassAnalysis {
  properties: PropertyExitAnalysis[];
  topExitCandidate: PropertyExitAnalysis | null;
  portfolioVerdict: string;
  verdictTone: ExitVerdictTone;
  assumptions: ExitCompassAssumptions;
  baselineMonthsToPayoff: number;
}

export interface ExitCompassPreviewDelta {
  propertyName: string;
  sellAtMonthCommitted: number;
  sellAtMonthPreview: number;
  monthsDelta: number;
  wealthDelta: number;
}
