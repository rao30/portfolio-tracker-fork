export type TimelineVerdictTone = 'positive' | 'caution' | 'neutral';

export interface TimelinePreferences {
  isCollapsed: boolean;
  focusedPropertyIndex: number;
  lastExploredPlanId: string | null;
  showCommittedGhost: boolean;
  updatedAt: string;
}

export interface TimelinePreviewDelta {
  monthsDelta: number;
  equityDelta: number;
  cashflowDelta: number;
  eventCountDelta: number;
}

export interface TimelineCommandAnalysis {
  verdict: string;
  verdictTone: TimelineVerdictTone;
  debtFreeLabel: string;
  previewEventCount: number;
  committedEventCount: number;
}
