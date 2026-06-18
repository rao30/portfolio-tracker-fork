export type RefinanceAnalysisMode = 'rate_term' | 'cash_out' | 'both';

export type RefinanceVerdict = 'strong' | 'marginal' | 'skip' | 'blocked' | 'balloon_pending';

export interface RefinanceRadarAssumptions {
  marketRate: number;
  closingCostPct: number;
  holdPeriodMonths: number;
  cashOutLtv: number;
  minDscr: number;
  deploymentYield: number;
  refiTermMonths: number;
  analysisMode: RefinanceAnalysisMode;
}

export interface RefinanceRadarPreferences {
  isCollapsed: boolean;
  pinnedProperty: string | null;
  analysisMode: RefinanceAnalysisMode;
  marketRate: number;
  closingCostPct: number;
  holdPeriodMonths: number;
  cashOutLtv: number;
  minDscr: number;
  deploymentYield: number;
  refiTermMonths: number;
  updatedAt: string;
}

export interface PropertyRefinanceOpportunity {
  propertyName: string;
  balance: number;
  marketValue: number;
  currentRate: number;
  currentPayment: number;
  ltv: number;
  currentDscr: number;
  isSellerFinancing: boolean;
  monthsUntilBalloon: number | null;
  rateTermNewPayment: number | null;
  monthlySavings: number | null;
  rateImprovementBps: number | null;
  closingCosts: number;
  breakEvenMonths: number | null;
  holdPeriodNetBenefit: number | null;
  rateTermVerdict: RefinanceVerdict;
  rateTermRationale: string;
  maxLoanAmount: number | null;
  cashOutGross: number | null;
  cashOutNet: number | null;
  cashOutNewPayment: number | null;
  cashOutDscr: number | null;
  cashOutMonthlyDelta: number | null;
  cashOutNetAnnualYield: number | null;
  cashOutVerdict: RefinanceVerdict;
  cashOutRationale: string;
  primaryVerdict: RefinanceVerdict;
  headline: string;
}

export interface RefinanceRadarAnalysis {
  properties: PropertyRefinanceOpportunity[];
  eligibleCount: number;
  strongCount: number;
  marginalCount: number;
  skipCount: number;
  blockedCount: number;
  totalMonthlySavingsPotential: number;
  totalCashOutPotential: number;
  verdict: string;
  verdictTone: 'positive' | 'caution' | 'neutral';
  assumptions: RefinanceRadarAssumptions;
}
