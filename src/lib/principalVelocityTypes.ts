export type PrincipalVelocityViewMode = 'monthly' | 'cumulative' | 'stacked';

export type PrincipalVelocityHorizon = 12 | 36 | 60 | 120 | 180 | 360;

export interface PrincipalVelocityPreferences {
  isCollapsed: boolean;
  viewMode: PrincipalVelocityViewMode;
  horizonMonths: PrincipalVelocityHorizon;
  showBaselineComparison: boolean;
  pinnedPropertyName: string | null;
  lastExploredBudget: number | null;
  updatedAt: string;
}

export interface PrincipalVelocityPoint {
  month: number;
  scheduledPrincipal: number;
  extraPrincipal: number;
  totalPrincipal: number;
  cumulativePrincipal: number;
  monthlyCashflow: number;
  appreciation: number;
  wealthVelocity: number;
  baselinePrincipal: number;
  baselineCumulative: number;
}

export interface PropertyPrincipalShare {
  propertyName: string;
  principalThisMonth: number;
  principalYearToDate: number;
  percentOfPortfolio: number;
  payoffMonth: number | null;
}

export type PrincipalVelocityVerdictTone = 'positive' | 'caution' | 'neutral';

export interface PrincipalVelocityAnalysis {
  points: PrincipalVelocityPoint[];
  currentMonthPrincipal: number;
  year1TotalPrincipal: number;
  year5AverageMonthlyPrincipal: number;
  baselineYear1Principal: number;
  accelerationFactorYear1: number;
  peakPrincipalMonth: number;
  peakPrincipalAmount: number;
  hiddenIncomeRatio: number;
  propertyShares: PropertyPrincipalShare[];
  verdict: string;
  verdictTone: PrincipalVelocityVerdictTone;
}

export interface PrincipalVelocityPreviewDelta {
  year1PrincipalDelta: number;
  accelerationDelta: number;
  peakPrincipalDelta: number;
  monthsToPeakDelta: number;
}
