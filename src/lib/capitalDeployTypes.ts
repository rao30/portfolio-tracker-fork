export type DeployLane = 'paydown' | 'reserve' | 'acquisition';

export type DeployVerdictTone = 'positive' | 'neutral' | 'caution';

export interface CapitalDeployPreferences {
  isCollapsed: boolean;
  targetReserveMonths: number;
  acquisitionCocHurdle: number;
  lastExploredDeployAmount: number | null;
  pinnedLane: DeployLane | null;
  deployStep: number;
  showLaneComparison: boolean;
  updatedAt: string;
}

export interface LiquiditySnapshot {
  monthlySurplus: number;
  operatingBurn: number;
  cashReserve: number;
  reserveRunwayMonths: number;
  targetReserveMonths: number;
  reserveGapMonths: number;
  weightedAvgMortgageRate: number;
}

export interface DeployLaneMetrics {
  lane: DeployLane;
  label: string;
  headline: string;
  subline: string;
  annualizedReturn: number;
  score: number;
  monthsImpact: number | null;
  dollarImpact: number | null;
  isWinner: boolean;
}

export interface CapitalDeployAnalysis {
  liquidity: LiquiditySnapshot;
  lanes: DeployLaneMetrics[];
  winner: DeployLane;
  verdict: string;
  verdictTone: DeployVerdictTone;
  safeExtraBudgetCeiling: number;
  acquisitionDownPayment: number;
  acquisitionCocFromTemplate: number;
  monthsToAcquisitionFund: number | null;
  acquisitionFundProgress: number;
}

export interface CapitalDeployPreviewDelta {
  deployAmountCommitted: number;
  deployAmountPreview: number;
  winnerCommitted: DeployLane;
  winnerPreview: DeployLane;
  winnerChanged: boolean;
  paydownInterestDelta: number;
  reserveRunwayDelta: number;
}
