import type { StrategyId } from './snowball';

export type PayoffLandscapeMetric = 'monthsToPayoff' | 'totalInterest' | 'interestSaved';

export interface PayoffLandscapeCell {
  strategyId: StrategyId;
  budget: number;
  monthsToPayoff: number;
  totalInterest: number;
  interestSaved: number;
  isOptimal: boolean;
  isCurrent: boolean;
}

export interface PayoffLandscapeViewport {
  metric: PayoffLandscapeMetric;
  budgetMin: number;
  budgetMax: number;
  budgetStep: number;
}

export interface PayoffLandscapeAnalysis {
  cells: PayoffLandscapeCell[];
  budgets: number[];
  strategies: StrategyId[];
  viewport: PayoffLandscapeViewport;
  optimal: { strategyId: StrategyId; budget: number; monthsToPayoff: number };
  metricMin: number;
  metricMax: number;
  currentCell: PayoffLandscapeCell | null;
}

export interface PayoffLandscapePreferences {
  metric: PayoffLandscapeMetric;
  budgetMin: number;
  budgetMax: number;
  budgetStep: number;
  isCollapsed: boolean;
  updatedAt: string;
}

export const LANDSCAPE_METRIC_LABELS: Record<PayoffLandscapeMetric, string> = {
  monthsToPayoff: 'Months to debt-free',
  totalInterest: 'Total interest paid',
  interestSaved: 'Interest saved vs baseline',
};
