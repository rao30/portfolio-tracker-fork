import type { Portfolio, ScenarioConfig } from './types';
import {
  runSimulation,
  runSimulationWithPayoffOrder,
  SCENARIO_PRESETS,
  snapshotAtMonth,
  type StrategyId,
} from './snowball';
import { formatCurrency, formatMonths, formatSimulationMonthLabel } from './format';
import type {
  StressImpact,
  StressLabCustomKnobs,
  StressPreviewDelta,
  StressScenarioAnalysis,
  StressVerdictTone,
} from './stressLabTypes';
import { CUSTOM_SCENARIO_ID, DEFAULT_CUSTOM_KNOBS } from './stressLabTypes';

const YEAR_15_MONTH = 180;
const YEAR_1_MONTH = 12;

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function runActiveSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId,
  scenario: ScenarioConfig | null,
  customOrder?: string[] | null,
) {
  if (customOrder && customOrder.length > 0) {
    return runSimulationWithPayoffOrder(portfolio, customOrder, scenario);
  }
  return runSimulation(portfolio, strategyId, scenario);
}

export function buildCustomScenario(knobs: StressLabCustomKnobs): ScenarioConfig {
  return {
    id: CUSTOM_SCENARIO_ID,
    label: 'Custom stress test',
    vacancyRate: knobs.vacancy,
    capexReserveRate: knobs.capex,
    rateShock: knobs.rateShock,
    pauseExtraMonths: knobs.pauseMonths,
  };
}

export function computeStressImpact(
  portfolio: Portfolio,
  strategyId: StrategyId,
  scenario: ScenarioConfig | null,
  customOrder?: string[] | null,
): StressImpact {
  const baseScenario = SCENARIO_PRESETS[0];
  const baseResult = runActiveSimulation(portfolio, strategyId, baseScenario, customOrder);
  const stressedResult = runActiveSimulation(
    portfolio,
    strategyId,
    scenario ?? baseScenario,
    customOrder,
  );

  const baseAt15 = snapshotAtMonth(baseResult, YEAR_15_MONTH);
  const stressedAt15 = snapshotAtMonth(stressedResult, YEAR_15_MONTH);
  const baseAt1 = snapshotAtMonth(baseResult, YEAR_1_MONTH);
  const stressedAt1 = snapshotAtMonth(stressedResult, YEAR_1_MONTH);

  const baseCashflow = baseAt1?.monthlyCashflow ?? 0;
  const stressedCashflow = stressedAt1?.monthlyCashflow ?? 0;
  const baseEquity = baseAt15?.totalEquity ?? 0;
  const stressedEquity = stressedAt15?.totalEquity ?? 0;

  return {
    monthsToPayoff: stressedResult.monthsToPayoff,
    monthsDelta: stressedResult.monthsToPayoff - baseResult.monthsToPayoff,
    totalInterest: stressedResult.totalInterestPaid,
    interestDelta: stressedResult.totalInterestPaid - baseResult.totalInterestPaid,
    equityAtYear15: stressedEquity,
    equityDeltaAtYear15: stressedEquity - baseEquity,
    monthlyCashflowYear1: stressedCashflow,
    cashflowDeltaYear1: stressedCashflow - baseCashflow,
  };
}

function debtFreeLabel(months: number, portfolio: Portfolio): string {
  return formatSimulationMonthLabel(months, portfolio.simulationAnchorYear ?? 2026, portfolio.simulationAnchorMonth ?? 1);
}

function severityScore(impact: StressImpact): number {
  const monthPenalty = Math.min(50, Math.max(0, impact.monthsDelta) * 1.5);
  const interestPenalty = Math.min(35, Math.max(0, impact.interestDelta) / 2500);
  const equityPenalty = Math.min(15, Math.max(0, -impact.equityDeltaAtYear15) / 25000);
  return Math.round(Math.min(100, monthPenalty + interestPenalty + equityPenalty));
}

function verdictTone(score: number, isBase: boolean): StressVerdictTone {
  if (isBase) return 'neutral';
  if (score >= 60) return 'severe';
  if (score >= 30) return 'caution';
  if (score <= 10) return 'positive';
  return 'neutral';
}

function buildVerdict(scenario: ScenarioConfig, impact: StressImpact, tone: StressVerdictTone): string {
  if (scenario.id === 'base') {
    return 'Base case — no stress assumptions. Charts and metrics reflect your committed portfolio.';
  }

  if (tone === 'severe') {
    return `${scenario.label} pushes debt-free out by ${formatMonths(impact.monthsDelta)} and costs ${formatCurrencyShort(impact.interestDelta)} more interest. Plan a buffer or bump extra payments before this hits.`;
  }

  if (tone === 'caution') {
    return `${scenario.label} adds ${formatMonths(impact.monthsDelta)} to payoff and ${formatCurrencyShort(impact.interestDelta)} in interest. Manageable, but worth monitoring cash reserves.`;
  }

  if (tone === 'positive') {
    if (scenario.sellProperty) {
      return `Selling ${scenario.sellProperty} accelerates payoff by ${formatMonths(Math.abs(impact.monthsDelta))} and saves ${formatCurrencyShort(Math.abs(impact.interestDelta))} in interest.`;
    }
    return `${scenario.label} has limited impact — portfolio stays resilient with only ${formatMonths(Math.max(0, impact.monthsDelta))} added to payoff.`;
  }

  return `${scenario.label} shifts debt-free by ${formatMonths(impact.monthsDelta)} with ${formatCurrencyShort(impact.interestDelta)} interest delta at year 15 equity ${formatCurrencyShort(impact.equityDeltaAtYear15)}.`;
}

export function analyzeStressScenario(
  portfolio: Portfolio,
  strategyId: StrategyId,
  scenario: ScenarioConfig,
  customOrder?: string[] | null,
): StressScenarioAnalysis {
  const impact = computeStressImpact(portfolio, strategyId, scenario, customOrder);
  const isBase = scenario.id === 'base';
  const score = isBase ? 0 : severityScore(impact);
  const tone = verdictTone(score, isBase);

  return {
    scenario,
    impact,
    verdict: buildVerdict(scenario, impact, tone),
    verdictTone: tone,
    severityScore: score,
  };
}

export function computeStressPreviewDelta(
  portfolio: Portfolio,
  strategyId: StrategyId,
  committedScenario: ScenarioConfig,
  previewScenario: ScenarioConfig,
  customOrder?: string[] | null,
): StressPreviewDelta {
  const committed = runActiveSimulation(portfolio, strategyId, committedScenario, customOrder);
  const preview = runActiveSimulation(portfolio, strategyId, previewScenario, customOrder);

  const committedAt15 = snapshotAtMonth(committed, YEAR_15_MONTH);
  const previewAt15 = snapshotAtMonth(preview, YEAR_15_MONTH);

  return {
    monthsDelta: preview.monthsToPayoff - committed.monthsToPayoff,
    interestDelta: preview.totalInterestPaid - committed.totalInterestPaid,
    equityDeltaAtYear15: (previewAt15?.totalEquity ?? 0) - (committedAt15?.totalEquity ?? 0),
    debtFreeLabelCommitted: debtFreeLabel(committed.monthsToPayoff, portfolio),
    debtFreeLabelPreview: debtFreeLabel(preview.monthsToPayoff, portfolio),
  };
}

export function impactDeltaLabel(monthsDelta: number): string {
  if (monthsDelta === 0) return 'No change';
  const sign = monthsDelta < 0 ? '−' : '+';
  return `${sign}${formatMonths(Math.abs(monthsDelta))}`;
}

export function impactToneClass(tone: StressVerdictTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  if (tone === 'severe') return 'border-red-500/40 bg-red-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

export function formatImpactCurrency(delta: number): string {
  if (delta === 0) return '—';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatCurrency(Math.abs(delta))}`;
}

export function resolveScenarioFromId(
  scenarioId: string,
  customKnobs: StressLabCustomKnobs = DEFAULT_CUSTOM_KNOBS,
  sellScenarios: ScenarioConfig[] = [],
): ScenarioConfig {
  if (scenarioId === CUSTOM_SCENARIO_ID) {
    return buildCustomScenario(customKnobs);
  }
  const preset = SCENARIO_PRESETS.find((s) => s.id === scenarioId);
  if (preset) return preset;
  const sell = sellScenarios.find((s) => s.id === scenarioId);
  if (sell) return sell;
  return SCENARIO_PRESETS[0];
}

export function presetCategoryLabel(scenario: ScenarioConfig): string {
  if (scenario.sellProperty) return 'Exit';
  if (scenario.pauseExtraMonths) return 'Cash pause';
  if (scenario.rateShock) return 'Rates';
  if (scenario.vacancyRate) return 'Vacancy';
  if (scenario.capexReserveRate) return 'Capex';
  return 'Base';
}

export function scenariosEqual(a: ScenarioConfig, b: ScenarioConfig): boolean {
  if (a.id !== b.id) return false;
  if (a.id === CUSTOM_SCENARIO_ID) {
    return (
      a.vacancyRate === b.vacancyRate &&
      a.capexReserveRate === b.capexReserveRate &&
      a.rateShock === b.rateShock &&
      a.pauseExtraMonths === b.pauseExtraMonths
    );
  }
  return true;
}
