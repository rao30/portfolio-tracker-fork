export type ExitAnalysisMode = 'hold' | 'sell' | 'exchange' | 'all';

export type ExitPathId = 'hold' | 'sell' | 'exchange';

export type ExitVerdict = 'strong_exit' | 'consider_exit' | 'hold' | 'blocked';

export interface ExitCompassAssumptions {
  sellAtMonth: number;
  closingCostPct: number;
  capitalGainsRate: number;
  recaptureRate: number;
  holdHorizonMonths: number;
  proceedsToDebtPct: number;
  analysisMode: ExitAnalysisMode;
}

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

export interface ExitTaxBreakdown {
  grossSalePrice: number;
  sellingCosts: number;
  loanPayoff: number;
  adjustedBasis: number;
  accumulatedDepreciation: number;
  totalGain: number;
  depreciationRecapture: number;
  recaptureTax: number;
  capitalGain: number;
  capitalGainsTax: number;
  stateTax: number;
  totalTax: number;
}

export interface ExitPathMetrics {
  path: ExitPathId;
  label: string;
  netProceeds: number;
  trueNetEquity: number;
  taxLiability: number;
  projectedWealthAtHorizon: number;
  annualizedReturn: number;
  snowballMonthsDelta: number | null;
  snowballInterestSaved: number | null;
  headline: string;
  subline: string;
  isRecommended: boolean;
}

export interface PropertyExitAnalysis {
  propertyName: string;
  marketValue: number;
  balance: number;
  equity: number;
  ltv: number;
  returnOnEquity: number;
  annualCashflow: number;
  yearsHeld: number;
  taxBreakdown: ExitTaxBreakdown;
  paths: ExitPathMetrics[];
  primaryVerdict: ExitVerdict;
  headline: string;
  rankScore: number;
}

export interface ExitCompassAnalysis {
  properties: PropertyExitAnalysis[];
  topExitCandidate: string | null;
  holdCount: number;
  exitCount: number;
  totalTaxExposure: number;
  totalTrueNetEquity: number;
  verdict: string;
  verdictTone: 'positive' | 'caution' | 'neutral';
  assumptions: ExitCompassAssumptions;
}

export interface ExitCompassPreviewDelta {
  propertyName: string;
  baselineMonthsToPayoff: number;
  sellMonthsToPayoff: number;
  monthsDelta: number;
  interestSaved: number;
  afterTaxProceeds: number;
  exchangeProceeds: number;
}
