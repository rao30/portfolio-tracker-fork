export type GoalCommandTab = 'debtFree' | 'equity';

export interface GoalCommandPreferences {
  isCollapsed: boolean;
  activeGoalType: GoalCommandTab;
  debtFreeTargetMonth: number;
  equityTargetMonth: number;
  equityTargetValue: number;
  lastExploredBudget: number | null;
  updatedAt: string | null;
}

export type GoalStatusTone = 'positive' | 'caution' | 'neutral';

export interface GoalCommandAnalysis {
  activeTab: GoalCommandTab;
  statusTone: GoalStatusTone;
  statusHeadline: string;
  statusDetail: string;
  currentMonth: number;
  projectedPayoffMonth: number;
  debtFreeTargetMonth: number;
  equityTargetMonth: number;
  equityTargetValue: number;
  projectedEquityAtHorizon: number;
  debtFreeLabel: string;
  goalLabel: string;
  projectedLabel: string;
  monthsToGoal: number;
  monthsDelta: number;
  isOnTrack: boolean;
  requiredBudget: number | null;
  committedBudget: number;
  progressPercent: number;
}

export interface GoalBudgetPreviewDelta {
  committedBudget: number;
  previewBudget: number;
  payoffMonthCommitted: number;
  payoffMonthPreview: number;
  debtFreeLabelCommitted: string;
  debtFreeLabelPreview: string;
  monthsDelta: number;
  equityAtHorizonCommitted: number;
  equityAtHorizonPreview: number;
}
