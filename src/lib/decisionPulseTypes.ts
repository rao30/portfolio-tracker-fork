import type { StrategyId } from './snowball';

export interface DecisionPulseAction {
  propertyName: string;
  balance: number;
  annualRate: number;
  monthlyPayment: number;
  payoffMonth: number;
  rationale: string;
}

export interface StrategyDuel {
  winner: StrategyId;
  winnerLabel: string;
  runnerUp: StrategyId;
  runnerUpLabel: string;
  monthsSaved: number;
  interestSaved: number;
  verdict: string;
}

export interface BudgetSensitivityPoint {
  budget: number;
  monthsToPayoff: number;
  totalInterest: number;
  deltaMonths: number;
  deltaInterest: number;
}

export interface DecisionPulseAnalysis {
  verdict: string;
  verdictTone: 'positive' | 'neutral' | 'caution';
  duel: StrategyDuel;
  action: DecisionPulseAction;
  sensitivity: BudgetSensitivityPoint[];
  debtFreeLabel: string;
  activeVsBest: {
    monthsBehind: number;
    interestBehind: number;
  } | null;
}

export interface DecisionPulsePreferences {
  isCollapsed: boolean;
  lastExploredBudget: number | null;
  pinnedVerdictStrategy: StrategyId | null;
  budgetStep: number;
  updatedAt: string;
}

export interface DecisionPulsePreviewDelta {
  monthsDelta: number;
  interestDelta: number;
  debtFreeLabelCommitted: string;
  debtFreeLabelPreview: string;
}
