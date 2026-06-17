import type { ScenarioConfig, StrategyId } from './types';

export interface StrategyLabScenario {
  id: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  scenario: ScenarioConfig | null;
  isPinned: boolean;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyLabMetrics {
  monthsToPayoff: number;
  interestSaved: number;
  equityYear10: number;
  equityYear15: number;
  finalEquity: number;
}

export interface StrategyLabPinInput {
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  scenario: ScenarioConfig | null;
  notes?: string | null;
}
