import type { Portfolio, Property, ScenarioConfig } from './types';
import {
  runSimulation,
  runSimulationWithPayoffOrder,
  snapshotAtMonth,
  type StrategyId,
} from './snowball';
import { buildPropertyHealth } from './propertyHealth';
import { formatMonths, formatSimulationMonthLabel } from './format';
import type {
  ExitCompassAnalysis,
  ExitCompassAssumptions,
  ExitCompassPreferences,
  ExitCompassPreviewDelta,
  ExitPathId,
  ExitPathOutcome,
  ExitTaxBreakdown,
  ExitVerdict,
  ExitVerdictTone,
  PropertyExitAnalysis,
} from './exitCompassTypes';

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export const DEFAULT_EXIT_ASSUMPTIONS: ExitCompassAssumptions = {
  sellAtMonth: 12,
  closingCostPct: 0.06,
  capitalGainsRate: 0.15,
  recaptureRate: 0.25,
  holdHorizonMonths: 120,
  proceedsToDebtPct: 1.0,
  analysisMode: 'all',
};

export function preferencesToAssumptions(
  prefs: Pick<
    ExitCompassPreferences,
    | 'sellAtMonth'
    | 'closingCostPct'
    | 'capitalGainsRate'
    | 'recaptureRate'
    | 'holdHorizonMonths'
    | 'proceedsToDebtPct'
    | 'analysisMode'
  >,
): ExitCompassAssumptions {
  return {
    sellAtMonth: prefs.sellAtMonth,
    closingCostPct: prefs.closingCostPct,
    capitalGainsRate: prefs.capitalGainsRate,
    recaptureRate: prefs.recaptureRate,
    holdHorizonMonths: prefs.holdHorizonMonths,
    proceedsToDebtPct: prefs.proceedsToDebtPct,
    analysisMode: prefs.analysisMode,
  };
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

function estimateDepreciationTaken(property: Property, portfolio: Portfolio): number {
  const basis = property.purchasePrice ?? property.marketValue;
  const landPct = property.landPercent ?? 0.2;
  const buildingBasis = basis * (1 - landPct);
  const serviceYear = property.placedInServiceYear ?? portfolio.simulationAnchorYear ?? 2020;
  const anchorYear = portfolio.simulationAnchorYear ?? new Date().getFullYear();
  const yearsHeld = Math.max(0, anchorYear - serviceYear);
  const annualDepreciation = buildingBasis / 27.5;
  return Math.min(buildingBasis * 0.9, annualDepreciation * yearsHeld);
}

export function computeSaleTaxBreakdown(
  property: Property,
  portfolio: Portfolio,
  assumptions: ExitCompassAssumptions,
  deferTaxes: boolean,
): ExitTaxBreakdown {
  const grossEquity = Math.max(0, property.marketValue - property.balance);
  const closingCosts = property.marketValue * assumptions.closingCostPct;
  const basis = property.purchasePrice ?? property.marketValue * 0.85;
  const depreciationTaken = estimateDepreciationTaken(property, portfolio);
  const adjustedBasis = Math.max(0, basis - depreciationTaken);
  const estimatedGain = Math.max(0, property.marketValue - closingCosts - adjustedBasis);
  const recaptureBase = Math.min(depreciationTaken, estimatedGain);
  const capitalGainBase = Math.max(0, estimatedGain - recaptureBase);

  const recaptureTax = deferTaxes ? 0 : recaptureBase * assumptions.recaptureRate;
  const capitalGainsTax = deferTaxes ? 0 : capitalGainBase * assumptions.capitalGainsRate;
  const totalTax = recaptureTax + capitalGainsTax;
  const netProceeds = Math.max(0, property.marketValue - closingCosts - property.balance - totalTax);
  const toDebt = netProceeds * assumptions.proceedsToDebtPct;
  const toCash = netProceeds - toDebt;

  return {
    grossEquity,
    closingCosts,
    estimatedGain,
    capitalGainsTax,
    recaptureTax,
    totalTax,
    netProceeds,
    toDebt,
    toCash,
  };
}

function effectiveClosingRate(
  property: Property,
  portfolio: Portfolio,
  assumptions: ExitCompassAssumptions,
  deferTaxes: boolean,
): number {
  if (deferTaxes) return assumptions.closingCostPct;
  const tax = computeSaleTaxBreakdown(property, portfolio, assumptions, false);
  const taxRate = property.marketValue > 0 ? tax.totalTax / property.marketValue : 0;
  return Math.min(0.15, assumptions.closingCostPct + taxRate);
}

function buildExitScenario(
  propertyName: string,
  property: Property,
  portfolio: Portfolio,
  assumptions: ExitCompassAssumptions,
  pathId: ExitPathId,
): ScenarioConfig {
  const deferTaxes = pathId === 'exchange';
  return {
    id: `exit-${pathId}-${propertyName}`,
    label: `${pathId} ${propertyName}`,
    sellProperty: propertyName,
    sellAtMonth: assumptions.sellAtMonth,
    sellClosingCostRate: effectiveClosingRate(property, portfolio, assumptions, deferTaxes),
    sellProceedsToDebt: assumptions.proceedsToDebtPct,
  };
}

function pathOutcomeFromResult(
  pathId: ExitPathId,
  label: string,
  result: ReturnType<typeof runSimulation>,
  horizonMonth: number,
  taxBreakdown: ExitTaxBreakdown | null,
  netProceeds: number | null,
): ExitPathOutcome {
  const snap = snapshotAtMonth(result, horizonMonth);
  const wealthAtHorizon = snap?.netWorth ?? 0;
  const cumulativeCashflow = snap?.cumulativeCashflow ?? 0;

  let headline: string;
  if (pathId === 'hold') {
    headline = `${formatCurrencyShort(wealthAtHorizon)} net worth at horizon`;
  } else if (pathId === 'exchange') {
    headline = `1031 deferral — ${formatCurrencyShort(netProceeds ?? 0)} redeployed`;
  } else {
    headline = `${formatCurrencyShort(netProceeds ?? 0)} net after tax`;
  }

  return {
    pathId,
    label,
    wealthAtHorizon,
    cumulativeCashflow,
    totalWealth: wealthAtHorizon + cumulativeCashflow,
    monthsToDebtFree: result.monthsToPayoff,
    interestPaid: result.totalInterestPaid,
    netProceeds,
    taxBreakdown,
    headline,
  };
}

function scoreProperty(
  property: Property,
  portfolio: Portfolio,
  roe: number,
  avgRoe: number,
): number {
  const health = buildPropertyHealth(property, portfolio);
  let score = health.score;

  if (avgRoe > 0 && roe < avgRoe * 0.5) score -= 15;
  else if (avgRoe > 0 && roe < avgRoe * 0.75) score -= 8;

  if (property.monthlyRent <= 0 && property.balance <= 0) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function pickRecommendation(
  paths: ExitPathOutcome[],
  keepScore: number,
): { recommendation: ExitVerdict; winningPath: ExitPathId } {
  const hold = paths.find((p) => p.pathId === 'hold');
  const sell = paths.find((p) => p.pathId === 'sell');
  const exchange = paths.find((p) => p.pathId === 'exchange');

  if (!hold || !sell || !exchange) {
    return { recommendation: 'review', winningPath: 'hold' };
  }

  const ranked = [...paths].sort((a, b) => b.totalWealth - a.totalWealth);
  const winner = ranked[0]!.pathId;
  const wealthSpread = ranked[0]!.totalWealth - ranked[ranked.length - 1]!.totalWealth;
  const spreadPct = ranked[0]!.totalWealth > 0 ? wealthSpread / ranked[0]!.totalWealth : 0;

  if (spreadPct < 0.03) {
    return { recommendation: 'review', winningPath: winner };
  }

  if (winner === 'hold' && keepScore >= 70) {
    return { recommendation: 'hold', winningPath: 'hold' };
  }
  if (winner === 'sell') {
    return { recommendation: 'sell', winningPath: 'sell' };
  }
  if (winner === 'exchange') {
    return { recommendation: 'exchange', winningPath: 'exchange' };
  }

  return { recommendation: 'review', winningPath: winner };
}

function analyzeProperty(
  portfolio: Portfolio,
  property: Property,
  strategyId: StrategyId,
  assumptions: ExitCompassAssumptions,
  customOrder?: string[] | null,
  avgRoe?: number,
): PropertyExitAnalysis {
  const health = buildPropertyHealth(property, portfolio);
  const equity = health.metrics.equity;
  const monthlyCashflow = health.metrics.monthlyCashflow;
  const roe = equity > 0 ? (monthlyCashflow * 12) / equity : 0;

  const holdResult = runActiveSimulation(portfolio, strategyId, null, customOrder);

  const sellScenario = buildExitScenario(property.name, property, portfolio, assumptions, 'sell');
  const sellTax = computeSaleTaxBreakdown(property, portfolio, assumptions, false);
  const sellResult = runActiveSimulation(portfolio, strategyId, sellScenario, customOrder);

  const exchangeScenario = buildExitScenario(
    property.name,
    property,
    portfolio,
    assumptions,
    'exchange',
  );
  const exchangeTax = computeSaleTaxBreakdown(property, portfolio, assumptions, true);
  const exchangeResult = runActiveSimulation(
    portfolio,
    strategyId,
    exchangeScenario,
    customOrder,
  );

  const horizon = assumptions.holdHorizonMonths;
  const paths: ExitPathOutcome[] = [
    pathOutcomeFromResult('hold', 'Keep', holdResult, horizon, null, null),
    pathOutcomeFromResult('sell', 'Sell', sellResult, horizon, sellTax, sellTax.netProceeds),
    pathOutcomeFromResult(
      'exchange',
      '1031 Exchange',
      exchangeResult,
      horizon,
      exchangeTax,
      exchangeTax.netProceeds,
    ),
  ];

  const keepScore = scoreProperty(property, portfolio, roe, avgRoe ?? roe);
  const { recommendation, winningPath } = pickRecommendation(paths, keepScore);

  const monthsSavedVsHold = holdResult.monthsToPayoff - sellResult.monthsToPayoff;
  const interestSavedVsHold = holdResult.totalInterestPaid - sellResult.totalInterestPaid;

  const winner = paths.find((p) => p.pathId === winningPath)!;
  const sellWhen = formatSimulationMonthLabel(assumptions.sellAtMonth, portfolio);

  let headline: string;
  let subline: string;

  if (recommendation === 'sell' && monthsSavedVsHold > 0) {
    headline = `Sell accelerates debt-free by ${formatMonths(monthsSavedVsHold)}`;
    subline = `${formatCurrencyShort(sellTax.netProceeds)} net proceeds redeployed into snowball payoff.`;
  } else if (recommendation === 'exchange') {
    headline = `1031 exchange wins — defer ${formatCurrencyShort(sellTax.totalTax)} in taxes`;
    subline = `Tax-deferred reinvestment yields ${formatCurrencyShort(winner.totalWealth - paths[0]!.totalWealth)} more wealth at horizon.`;
  } else if (recommendation === 'hold') {
    headline = `Keep — ${formatPercent(roe)} ROE earns its place`;
    subline = `Holding beats exit paths by ${formatCurrencyShort(winner.totalWealth - paths[1]!.totalWealth)} at ${formatMonths(horizon)}.`;
  } else {
    headline = `Review — paths within 3% at ${sellWhen}`;
    subline = `Hold ${formatCurrencyShort(paths[0]!.totalWealth)} vs sell ${formatCurrencyShort(paths[1]!.totalWealth)} total wealth.`;
  }

  return {
    propertyName: property.name,
    equity,
    monthlyCashflow,
    roe,
    keepScore,
    recommendation,
    winningPath,
    paths,
    snowballBoost: {
      monthsSavedVsHold,
      interestSavedVsHold,
    },
    headline,
    subline,
  };
}

function formatPercent(rate: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate);
}

export function computeExitCompassAnalysis(
  portfolio: Portfolio,
  strategyId: StrategyId,
  assumptions: ExitCompassAssumptions,
  customOrder?: string[] | null,
): ExitCompassAnalysis {
  const baseline = runActiveSimulation(portfolio, strategyId, null, customOrder);

  const roeValues = portfolio.properties
    .filter((p) => p.marketValue > 0 || p.balance > 0)
    .map((p) => {
      const eq = Math.max(0, p.marketValue - p.balance);
      const health = buildPropertyHealth(p, portfolio);
      return eq > 0 ? (health.metrics.monthlyCashflow * 12) / eq : 0;
    });
  const avgRoe =
    roeValues.length > 0 ? roeValues.reduce((a, b) => a + b, 0) / roeValues.length : 0;

  const properties = portfolio.properties
    .filter((p) => p.marketValue > 0.01 || p.balance > 0.01)
    .map((p) =>
      analyzeProperty(portfolio, p, strategyId, assumptions, customOrder, avgRoe),
    )
    .sort((a, b) => {
      if (a.recommendation === 'sell' && b.recommendation !== 'sell') return -1;
      if (b.recommendation === 'sell' && a.recommendation !== 'sell') return 1;
      return a.keepScore - b.keepScore;
    });

  const topExitCandidate =
    properties.find((p) => p.recommendation === 'sell' || p.recommendation === 'exchange') ??
    properties[0] ??
    null;

  let portfolioVerdict: string;
  let verdictTone: ExitVerdictTone = 'neutral';

  if (!topExitCandidate) {
    portfolioVerdict = 'Add properties with market values to run exit analysis.';
  } else if (topExitCandidate.recommendation === 'sell') {
    portfolioVerdict = `Strongest exit: ${shortName(topExitCandidate.propertyName)} — ${topExitCandidate.headline}`;
    verdictTone = 'caution';
  } else if (topExitCandidate.recommendation === 'exchange') {
    portfolioVerdict = `1031 opportunity: ${shortName(topExitCandidate.propertyName)} — tax-deferred exit wins.`;
    verdictTone = 'positive';
  } else if (properties.every((p) => p.recommendation === 'hold')) {
    portfolioVerdict = 'Portfolio looks healthy — every property earns its place on hold analysis.';
    verdictTone = 'positive';
  } else {
    portfolioVerdict = `${properties.filter((p) => p.recommendation !== 'hold').length} properties need exit review at current assumptions.`;
    verdictTone = 'neutral';
  }

  return {
    properties,
    topExitCandidate,
    portfolioVerdict,
    verdictTone,
    assumptions,
    baselineMonthsToPayoff: baseline.monthsToPayoff,
  };
}

function shortName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

export function computeExitPreviewDelta(
  portfolio: Portfolio,
  strategyId: StrategyId,
  propertyName: string,
  committedMonth: number,
  previewMonth: number,
  assumptions: ExitCompassAssumptions,
  customOrder?: string[] | null,
): ExitCompassPreviewDelta {
  const property = portfolio.properties.find((p) => p.name === propertyName);
  if (!property) {
    return {
      propertyName,
      sellAtMonthCommitted: committedMonth,
      sellAtMonthPreview: previewMonth,
      monthsDelta: 0,
      wealthDelta: 0,
    };
  }

  const committedAssumptions = { ...assumptions, sellAtMonth: committedMonth };
  const previewAssumptions = { ...assumptions, sellAtMonth: previewMonth };

  const committed = analyzeProperty(
    portfolio,
    property,
    strategyId,
    committedAssumptions,
    customOrder,
  );
  const preview = analyzeProperty(
    portfolio,
    property,
    strategyId,
    previewAssumptions,
    customOrder,
  );

  const committedSell = committed.paths.find((p) => p.pathId === 'sell')!;
  const previewSell = preview.paths.find((p) => p.pathId === 'sell')!;

  return {
    propertyName,
    sellAtMonthCommitted: committedMonth,
    sellAtMonthPreview: previewMonth,
    monthsDelta: previewSell.monthsToDebtFree - committedSell.monthsToDebtFree,
    wealthDelta: previewSell.totalWealth - committedSell.totalWealth,
  };
}

export function verdictToneClass(tone: ExitVerdictTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

export function recommendationBadgeClass(rec: ExitVerdict): string {
  if (rec === 'hold') return 'bg-emerald-500/20 text-emerald-300';
  if (rec === 'sell') return 'bg-amber-500/20 text-amber-300';
  if (rec === 'exchange') return 'bg-violet-500/20 text-violet-300';
  return 'bg-slate-500/20 text-slate-300';
}

export function recommendationLabel(rec: ExitVerdict): string {
  if (rec === 'hold') return 'Keep';
  if (rec === 'sell') return 'Sell';
  if (rec === 'exchange') return '1031';
  return 'Review';
}
