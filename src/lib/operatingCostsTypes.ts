import type { ExpenseBreakdown } from './types';

export type ExpensePresetId =
  | 'lean_self_managed'
  | 'typical'
  | 'agency_managed'
  | 'from_market_value';

export type OperatingCostsEntryMode = 'breakdown' | 'lump_sum';

export interface OperatingCostsPreferences {
  isCollapsed: boolean;
  focusedPropertyIndex: number;
  showScheduleE: boolean;
  entryMode: OperatingCostsEntryMode;
  lastExploredPreset: ExpensePresetId | null;
  updatedAt: string;
}

export type ExpenseLineKey = keyof ExpenseBreakdown;

export interface ExpenseLineMeta {
  key: ExpenseLineKey;
  label: string;
  scheduleELine: string;
  scheduleELabel: string;
  allowPercent?: boolean;
  hint?: string;
}

export interface ResolvedExpenseLine {
  key: ExpenseLineKey;
  label: string;
  scheduleELine: string;
  scheduleELabel: string;
  monthlyAmount: number;
  annualAmount: number;
  shareOfOperating: number;
  isDerived: boolean;
}

export interface OperatingCostsMetrics {
  monthlyOperating: number;
  monthlyUtilities: number;
  monthlyNoi: number;
  monthlyCashflow: number;
  dscr: number | null;
  operatingExpenseRatio: number | null;
}

export interface OperatingCostsDelta {
  monthlyOperatingDelta: number;
  monthlyNoiDelta: number;
  monthlyCashflowDelta: number;
  dscrDelta: number | null;
}

export interface OperatingCostsAnalysis {
  lines: ResolvedExpenseLine[];
  scheduleETotals: { line: string; label: string; annual: number }[];
  metrics: OperatingCostsMetrics;
  issues: string[];
  hasBreakdown: boolean;
  lumpSumFallback: number;
}
