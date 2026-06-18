export type RefinanceAnalysisMode = 'rate_term' | 'cash_out' | 'both';

export type RefinanceReadinessStatus =
  | 'ready'
  | 'cushion_tight'
  | 'rate_shock_risk'
  | 'not_refinanceable'
  | 'window_open'
  | 'cash_out_opportunity'
  | 'conventional';

export interface RefinanceRadarAssumptions {
  marketRate: number;
  closingCostPct: number;
  holdPeriodMonths: number;
  cashOutLtv: number;
  minDscr: number;
  deploymentYield: number;
  refiTermMonths: number;
}

export interface RefinanceRadarPreferences extends RefinanceRadarAssumptions {
  isCollapsed: boolean;
  pinnedProperty: string | null;
  analysisMode: RefinanceAnalysisMode;
  updatedAt: string | null;
}

export interface RateShockScenario {
  label: string;
  rateBps: number;
  effectiveRate: number;
  monthlyPayment: number;
  dscr: number;
  passesMinDscr: boolean;
}

export interface PropertyRefinanceAnalysis {
  propertyName: string;
  status: RefinanceReadinessStatus;
  eventMonth: number | null;
  monthsUntilEvent: number | null;
  actionWindowStartMonth: number | null;
  currentBalance: number;
  marketValueAtEvent: number;
  annualNoiAtEvent: number;
  currentMonthlyPayment: number;
  refiMonthlyPayment: number;
  monthlyPaymentDelta: number;
  closingCosts: number;
  breakEvenMonths: number | null;
  dscrAtRefi: number;
  ltvAtRefi: number;
  maxCashOutLoan: number;
  cashOutProceeds: number;
  redeployMonthlyIncome: number;
  netCashflowAfterRefi: number;
  rateShocks: RateShockScenario[];
  actionLabel: string;
  priorityScore: number;
}

export interface RefinanceRadarAnalysis {
  properties: PropertyRefinanceAnalysis[];
  urgentCount: number;
  opportunityCount: number;
  blockedCount: number;
  verdict: string;
  verdictTone: 'positive' | 'caution' | 'neutral' | 'severe';
  portfolioCashOutCapacity: number;
}

export const DEFAULT_REFINANCE_ASSUMPTIONS: RefinanceRadarAssumptions = {
  marketRate: 0.07,
  closingCostPct: 0.025,
  holdPeriodMonths: 60,
  cashOutLtv: 0.75,
  minDscr: 1.25,
  deploymentYield: 0.12,
  refiTermMonths: 360,
};

export const RATE_SHOCK_BPS = [0, 50, 100, 150] as const;
