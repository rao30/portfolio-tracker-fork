import type { ScenarioConfig } from './types';

export interface StressLabCustomKnobs {
  vacancy: number;
  capex: number;
  rateShock: number;
  pauseMonths: number;
}

export interface StressLabPreferences {
  isCollapsed: boolean;
  lastExploredScenarioId: string | null;
  pinnedPresetId: string | null;
  showSellScenarios: boolean;
  customKnobs: StressLabCustomKnobs;
  updatedAt: string | null;
}

export interface StressImpact {
  monthsToPayoff: number;
  monthsDelta: number;
  totalInterest: number;
  interestDelta: number;
  equityAtYear15: number;
  equityDeltaAtYear15: number;
  monthlyCashflowYear1: number;
  cashflowDeltaYear1: number;
}

export type StressVerdictTone = 'positive' | 'caution' | 'neutral' | 'severe';

export interface StressScenarioAnalysis {
  scenario: ScenarioConfig;
  impact: StressImpact;
  verdict: string;
  verdictTone: StressVerdictTone;
  severityScore: number;
}

export interface StressPreviewDelta {
  monthsDelta: number;
  interestDelta: number;
  equityDeltaAtYear15: number;
  debtFreeLabelCommitted: string;
  debtFreeLabelPreview: string;
}

export const CUSTOM_SCENARIO_ID = 'custom';

export const DEFAULT_CUSTOM_KNOBS: StressLabCustomKnobs = {
  vacancy: 0.05,
  capex: 0.1,
  rateShock: 0,
  pauseMonths: 0,
};
