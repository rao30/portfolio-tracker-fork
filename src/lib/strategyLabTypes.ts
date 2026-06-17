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

export interface StrategyLabPreferences {
  isCollapsed: boolean;
  lastExploredPinId: string | null;
  committedPinId: string | null;
  updatedAt: string | null;
}

export interface StrategyLabPinSnapshot {
  pinId: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  scenario: ScenarioConfig;
}

export interface StrategyLabPreviewDelta {
  monthsDelta: number;
  interestSavedDelta: number;
  equityYear10Delta: number;
  finalEquityDelta: number;
  budgetDelta: number;
  strategyChanged: boolean;
  scenarioChanged: boolean;
  debtFreeLabelCommitted: string;
  debtFreeLabelPreview: string;
}

export type StrategyLabVerdictTone = 'positive' | 'caution' | 'neutral';

export interface StrategyLabAnalysis {
  metrics: StrategyLabMetrics;
  previewDelta: StrategyLabPreviewDelta | null;
  verdict: string;
  verdictTone: StrategyLabVerdictTone;
}
