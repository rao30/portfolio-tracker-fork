import type { StrategyId } from './snowball';

export type LandscapeMetric = 'monthsToPayoff' | 'totalInterest' | 'interestSaved';

export interface PayoffLandscapePreferences {
  metric: LandscapeMetric;
  budgetMin: number;
  budgetMax: number;
  budgetStep: number;
  isCollapsed: boolean;
  updatedAt: string;
}

export interface LandscapeCell {
  strategyId: StrategyId;
  budget: number;
  monthsToPayoff: number;
  totalInterest: number;
  interestSaved: number;
  metricValue: number;
  intensity: number;
  isOptimal: boolean;
}

export interface PayoffLandscapeGrid {
  metric: LandscapeMetric;
  budgets: number[];
  strategies: StrategyId[];
  cells: LandscapeCell[][];
  optimalCell: LandscapeCell | null;
  activeCell: LandscapeCell | null;
}
