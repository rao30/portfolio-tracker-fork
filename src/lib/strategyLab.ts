import type { Portfolio, ScenarioConfig } from './types';
import {
  runSimulation,
  runSimulationWithPayoffOrder,
  SCENARIO_PRESETS,
  snapshotAtMonth,
  STRATEGIES,
  STRATEGY_LABELS,
  type StrategyId,
} from './snowball';
import { formatCurrency, formatMonths, formatSimulationMonthLabel } from './format';
import type {
  StrategyLabAnalysis,
  StrategyLabMetrics,
  StrategyLabPinSnapshot,
  StrategyLabPreviewDelta,
  StrategyLabScenario,
  StrategyLabVerdictTone,
} from './strategyLabTypes';

export function resolveScenarioConfig(
  portfolio: Portfolio,
  scenario: ScenarioConfig | null,
): ScenarioConfig {
  if (!scenario) return SCENARIO_PRESETS[0];
  if (scenario.id === 'base') return SCENARIO_PRESETS[0];
  const preset = SCENARIO_PRESETS.find((s) => s.id === scenario.id);
  if (preset) return preset;
  if (scenario.sellProperty) {
    const sell = portfolio.properties.find((p) => p.name === scenario.sellProperty);
    if (sell) {
      return {
        id: scenario.id,
        label: scenario.label || `Sell ${sell.name}`,
        sellProperty: sell.name,
        sellClosingCostRate: scenario.sellClosingCostRate,
        sellAtMonth: scenario.sellAtMonth,
        sellProceedsToDebt: scenario.sellProceedsToDebt,
      };
    }
  }
  return scenario;
}

export function resolveStrategyId(strategyId: StrategyId): StrategyId {
  return strategyId in STRATEGIES ? strategyId : 'highestRate';
}

export function computeStrategyLabMetrics(
  portfolio: Portfolio,
  budget: number,
  strategyId: StrategyId,
  scenario: ScenarioConfig,
  customOrder?: string[] | null,
): StrategyLabMetrics {
  const safeStrategyId = resolveStrategyId(strategyId);
  const working: Portfolio = { ...portfolio, extraMonthlyBudget: budget };
  const baseline = customOrder?.length
    ? runSimulationWithPayoffOrder(working, customOrder, scenario)
    : runSimulation(working, 'baseline', scenario);
  const active = customOrder?.length
    ? runSimulationWithPayoffOrder(working, customOrder, scenario)
    : runSimulation(working, safeStrategyId, scenario);
  const year10 = snapshotAtMonth(active, 120);
  const year15 = snapshotAtMonth(active, 180);

  return {
    monthsToPayoff: active.monthsToPayoff,
    interestSaved: baseline.totalInterestPaid - active.totalInterestPaid,
    equityYear10: year10?.totalEquity ?? 0,
    equityYear15: year15?.totalEquity ?? 0,
    finalEquity: active.finalEquity,
  };
}

export function pinToSnapshot(
  portfolio: Portfolio,
  pin: StrategyLabScenario,
): StrategyLabPinSnapshot {
  return {
    pinId: pin.id,
    name: pin.name,
    extraMonthlyBudget: pin.extraMonthlyBudget,
    strategyId: resolveStrategyId(pin.strategyId),
    scenario: resolveScenarioConfig(portfolio, pin.scenario),
  };
}

export function committedSnapshot(
  portfolio: Portfolio,
  budget: number,
  strategyId: StrategyId,
  scenario: ScenarioConfig,
): StrategyLabPinSnapshot {
  return {
    pinId: '',
    name: 'Current dashboard',
    extraMonthlyBudget: budget,
    strategyId,
    scenario,
  };
}

export function snapshotsMatch(
  a: StrategyLabPinSnapshot,
  b: StrategyLabPinSnapshot,
): boolean {
  return (
    a.extraMonthlyBudget === b.extraMonthlyBudget &&
    a.strategyId === b.strategyId &&
    a.scenario.id === b.scenario.id
  );
}

export function findMatchingPinId(
  pins: StrategyLabScenario[],
  portfolio: Portfolio,
  budget: number,
  strategyId: StrategyId,
  scenario: ScenarioConfig,
): string | null {
  const committed = committedSnapshot(portfolio, budget, strategyId, scenario);
  for (const pin of pins) {
    if (snapshotsMatch(committed, pinToSnapshot(portfolio, pin))) {
      return pin.id;
    }
  }
  return null;
}

export function computeStrategyLabPreviewDelta(
  portfolio: Portfolio,
  committed: StrategyLabPinSnapshot,
  preview: StrategyLabPinSnapshot,
  customOrder?: string[] | null,
): StrategyLabPreviewDelta {
  const committedMetrics = computeStrategyLabMetrics(
    portfolio,
    committed.extraMonthlyBudget,
    committed.strategyId,
    committed.scenario,
    customOrder,
  );
  const previewMetrics = computeStrategyLabMetrics(
    portfolio,
    preview.extraMonthlyBudget,
    preview.strategyId,
    preview.scenario,
    customOrder,
  );

  const anchorYear = portfolio.simulationAnchorYear;
  const anchorMonth = portfolio.simulationAnchorMonth;

  return {
    monthsDelta: previewMetrics.monthsToPayoff - committedMetrics.monthsToPayoff,
    interestSavedDelta: previewMetrics.interestSaved - committedMetrics.interestSaved,
    equityYear10Delta: previewMetrics.equityYear10 - committedMetrics.equityYear10,
    finalEquityDelta: previewMetrics.finalEquity - committedMetrics.finalEquity,
    budgetDelta: preview.extraMonthlyBudget - committed.extraMonthlyBudget,
    strategyChanged: preview.strategyId !== committed.strategyId,
    scenarioChanged: preview.scenario.id !== committed.scenario.id,
    debtFreeLabelCommitted: formatSimulationMonthLabel(
      committedMetrics.monthsToPayoff,
      anchorYear,
      anchorMonth,
    ),
    debtFreeLabelPreview: formatSimulationMonthLabel(
      previewMetrics.monthsToPayoff,
      anchorYear,
      anchorMonth,
    ),
  };
}

function verdictTone(monthsDelta: number, interestDelta: number): StrategyLabVerdictTone {
  if (monthsDelta <= -6 || interestDelta >= 5000) return 'positive';
  if (monthsDelta >= 6 || interestDelta <= -5000) return 'caution';
  return 'neutral';
}

export function buildStrategyLabVerdict(
  preview: StrategyLabPinSnapshot,
  delta: StrategyLabPreviewDelta,
): { verdict: string; verdictTone: StrategyLabVerdictTone } {
  const tone = verdictTone(delta.monthsDelta, delta.interestSavedDelta);
  const parts: string[] = [];

  if (delta.budgetDelta !== 0) {
    parts.push(
      `${delta.budgetDelta > 0 ? '+' : ''}${formatCurrency(delta.budgetDelta)}/mo budget`,
    );
  }
  if (delta.strategyChanged) {
    parts.push(STRATEGY_LABELS[preview.strategyId]);
  }
  if (delta.scenarioChanged) {
    parts.push(preview.scenario.label || preview.scenario.id);
  }

  const changeSummary = parts.length > 0 ? parts.join(' · ') : 'Same assumptions';

  if (delta.monthsDelta === 0 && delta.interestSavedDelta === 0) {
    return {
      verdict: `"${preview.name}" matches your current dashboard setup.`,
      verdictTone: 'neutral',
    };
  }

  const monthsPhrase =
    delta.monthsDelta === 0
      ? 'same debt-free timeline'
      : delta.monthsDelta < 0
        ? `${formatMonths(Math.abs(delta.monthsDelta))} sooner debt-free`
        : `${formatMonths(delta.monthsDelta)} later debt-free`;

  const interestPhrase =
    delta.interestSavedDelta === 0
      ? 'unchanged interest savings'
      : delta.interestSavedDelta > 0
        ? `${formatCurrency(delta.interestSavedDelta)} more interest saved`
        : `${formatCurrency(Math.abs(delta.interestSavedDelta))} less interest saved`;

  return {
    verdict: `Preview "${preview.name}" (${changeSummary}): ${monthsPhrase}, ${interestPhrase}. Debt-free ${delta.debtFreeLabelPreview} vs ${delta.debtFreeLabelCommitted}.`,
    verdictTone: tone,
  };
}

export function computeStrategyLabAnalysis(
  portfolio: Portfolio,
  committed: StrategyLabPinSnapshot,
  preview: StrategyLabPinSnapshot | null,
  customOrder?: string[] | null,
): StrategyLabAnalysis {
  const metrics = computeStrategyLabMetrics(
    portfolio,
    (preview ?? committed).extraMonthlyBudget,
    (preview ?? committed).strategyId,
    (preview ?? committed).scenario,
    customOrder,
  );

  if (!preview || snapshotsMatch(committed, preview)) {
    return {
      metrics,
      previewDelta: null,
      verdict: `Dashboard committed: ${STRATEGY_LABELS[committed.strategyId]} at ${formatCurrency(committed.extraMonthlyBudget)}/mo.`,
      verdictTone: 'neutral',
    };
  }

  const previewDelta = computeStrategyLabPreviewDelta(
    portfolio,
    committed,
    preview,
    customOrder,
  );
  const { verdict, verdictTone } = buildStrategyLabVerdict(preview, previewDelta);

  return { metrics, previewDelta, verdict, verdictTone };
}

export function impactDeltaLabel(monthsDelta: number): string {
  if (monthsDelta === 0) return '±0';
  return monthsDelta < 0
    ? `−${formatMonths(Math.abs(monthsDelta))}`
    : `+${formatMonths(monthsDelta)}`;
}

export function impactToneClass(tone: StrategyLabVerdictTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}
