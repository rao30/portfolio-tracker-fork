import type { AcquisitionTemplate, Portfolio } from './types';
import {
  runSimulation,
  runSimulationWithPayoffOrder,
  type StrategyId,
} from './snowball';
import type {
  CapitalDeployAnalysis,
  CapitalDeployPreviewDelta,
  DeployLane,
  DeployLaneMetrics,
  DeployVerdictTone,
  LiquiditySnapshot,
} from './capitalDeployTypes';

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(rate: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate);
}

function runActiveSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder?: string[] | null,
  extraBudget?: number,
) {
  const draft: Portfolio = {
    ...portfolio,
    extraMonthlyBudget: extraBudget ?? portfolio.extraMonthlyBudget,
  };
  if (customOrder && customOrder.length > 0) {
    return runSimulationWithPayoffOrder(draft, customOrder, null);
  }
  return runSimulation(draft, strategyId, null);
}

function weightedAvgMortgageRate(portfolio: Portfolio): number {
  let weighted = 0;
  let totalBalance = 0;
  for (const p of portfolio.properties) {
    if (p.balance > 0.01) {
      weighted += p.balance * p.annualInterestRate;
      totalBalance += p.balance;
    }
  }
  return totalBalance > 0 ? weighted / totalBalance : 0;
}

function propertyMonthlyCapex(
  grossRent: number,
  rate: number | undefined,
  flat: number | undefined,
  portfolio: Portfolio,
): number {
  const r = rate ?? portfolio.defaultCapexReserveRate;
  const f = flat ?? portfolio.defaultCapexReserveFlat;
  return grossRent * r + f;
}

function computeOperatingBurn(portfolio: Portfolio): number {
  let burn = 0;
  for (const p of portfolio.properties) {
    if (p.balance <= 0.01 && p.monthlyRent <= 0) continue;
    const grossRent = p.monthlyRent;
    const vacancy = grossRent * portfolio.defaultVacancyRate;
    const capex = propertyMonthlyCapex(
      grossRent,
      p.capexReserveRate,
      p.capexReserveFlat,
      portfolio,
    );
    burn += p.monthlyPayment + p.monthlyExpenses + vacancy + capex;
  }
  return Math.max(burn, 1);
}

function computeMonthlySurplus(portfolio: Portfolio, result: ReturnType<typeof runSimulation>): number {
  const snap = result.history[0];
  if (snap) return Math.max(0, snap.monthlyCashflow);
  return portfolio.properties.reduce((sum, p) => {
    const grossRent = p.monthlyRent * (1 - portfolio.defaultVacancyRate);
    const capex = propertyMonthlyCapex(
      p.monthlyRent,
      p.capexReserveRate,
      p.capexReserveFlat,
      portfolio,
    );
    return sum + grossRent - p.monthlyExpenses - p.monthlyPayment - capex;
  }, 0);
}

export function computeAcquisitionMetrics(template: AcquisitionTemplate): {
  downPayment: number;
  cashInvested: number;
  monthlyNet: number;
  cashOnCash: number;
} {
  const downPayment = template.purchasePrice * template.downPaymentPercent;
  const loanAmount = template.purchasePrice - downPayment;
  const monthlyRate = template.annualInterestRate / 12;
  const n = template.loanTermMonths;
  let monthlyPi = 0;
  if (loanAmount > 0 && n > 0) {
    if (monthlyRate <= 0) {
      monthlyPi = loanAmount / n;
    } else {
      monthlyPi =
        (loanAmount * monthlyRate * (1 + monthlyRate) ** n) /
        ((1 + monthlyRate) ** n - 1);
    }
  }
  const capex = template.monthlyRent * 0.05;
  const monthlyNet = template.monthlyRent - template.monthlyExpenses - monthlyPi - capex;
  const closingCosts = template.purchasePrice * 0.03;
  const cashInvested = downPayment + closingCosts;
  const cashOnCash = cashInvested > 0 ? (monthlyNet * 12) / cashInvested : 0;
  return { downPayment, cashInvested, monthlyNet, cashOnCash };
}

function laneLabel(lane: DeployLane): string {
  if (lane === 'paydown') return 'Pay down debt';
  if (lane === 'reserve') return 'Build cash reserves';
  return 'Save for next purchase';
}

function buildLiquiditySnapshot(
  portfolio: Portfolio,
  result: ReturnType<typeof runSimulation>,
  targetReserveMonths: number,
): LiquiditySnapshot {
  const monthlySurplus = computeMonthlySurplus(portfolio, result);
  const operatingBurn = computeOperatingBurn(portfolio);
  const cashReserve = result.history[0]?.cashReserveBalance ?? 0;
  const reserveRunwayMonths = cashReserve / operatingBurn;
  const reserveGapMonths = Math.max(0, targetReserveMonths - reserveRunwayMonths);

  return {
    monthlySurplus,
    operatingBurn,
    cashReserve,
    reserveRunwayMonths,
    targetReserveMonths,
    reserveGapMonths,
    weightedAvgMortgageRate: weightedAvgMortgageRate(portfolio),
  };
}

function computeSafeExtraBudgetCeiling(liquidity: LiquiditySnapshot): number {
  const { monthlySurplus, operatingBurn, reserveRunwayMonths, targetReserveMonths } =
    liquidity;
  if (reserveRunwayMonths >= targetReserveMonths) {
    return Math.max(0, monthlySurplus);
  }
  const reserveDeficit = (targetReserveMonths - reserveRunwayMonths) * operatingBurn;
  const deployable = monthlySurplus - reserveDeficit / 12;
  return Math.max(0, Math.min(monthlySurplus, deployable));
}

function scoreLane(
  lane: DeployLane,
  liquidity: LiquiditySnapshot,
  acquisitionCoc: number,
  acquisitionCocHurdle: number,
  deployAmount: number,
  paydownInterestSaved: number,
): DeployLaneMetrics {
  const avgRate = liquidity.weightedAvgMortgageRate;

  if (lane === 'paydown') {
    const annualizedReturn = avgRate;
    const score = annualizedReturn * 100;
    return {
      lane,
      label: laneLabel(lane),
      headline: `${formatPercent(avgRate)} effective return`,
      subline: `Saves ${formatCurrencyShort(paydownInterestSaved)}/yr in interest on ${formatCurrencyShort(deployAmount * 12)} deployed`,
      annualizedReturn,
      score,
      monthsImpact: null,
      dollarImpact: paydownInterestSaved,
      isWinner: false,
    };
  }

  if (lane === 'reserve') {
    const runwayGain = liquidity.operatingBurn > 0 ? deployAmount / liquidity.operatingBurn : 0;
    const annualizedReturn = liquidity.reserveGapMonths > 0 ? 0.15 : 0.03;
    const score = liquidity.reserveGapMonths > 0 ? 50 + runwayGain * 10 : runwayGain * 5;
    return {
      lane,
      label: laneLabel(lane),
      headline:
        liquidity.reserveGapMonths > 0
          ? `${liquidity.reserveGapMonths.toFixed(1)} mo below target`
          : `${liquidity.reserveRunwayMonths.toFixed(1)} mo runway`,
      subline: `+${runwayGain.toFixed(2)} mo runway per ${formatCurrencyShort(deployAmount)}/mo`,
      annualizedReturn,
      score,
      monthsImpact: runwayGain,
      dollarImpact: deployAmount,
      isWinner: false,
    };
  }

  const cocSpread = acquisitionCoc - avgRate;
  const hurdleSpread = acquisitionCoc - acquisitionCocHurdle;
  const annualizedReturn = Math.max(0, acquisitionCoc);
  const score = cocSpread * 100 + (hurdleSpread > 0 ? 20 : 0);
  return {
    lane,
    label: laneLabel(lane),
    headline: `${formatPercent(acquisitionCoc)} CoC on template deal`,
    subline:
      cocSpread > 0
        ? `Beats portfolio avg rate by ${formatPercent(cocSpread)}`
        : `Trails portfolio avg rate by ${formatPercent(Math.abs(cocSpread))}`,
    annualizedReturn,
    score,
    monthsImpact: null,
    dollarImpact: null,
    isWinner: false,
  };
}

function pickWinner(
  lanes: DeployLaneMetrics[],
  liquidity: LiquiditySnapshot,
  acquisitionCoc: number,
  acquisitionCocHurdle: number,
  pinnedLane: DeployLane | null,
): { winner: DeployLane; verdict: string; tone: DeployVerdictTone } {
  if (pinnedLane) {
    const pinned = lanes.find((l) => l.lane === pinnedLane);
    if (pinned) {
      return {
        winner: pinnedLane,
        verdict: `Pinned: deploy surplus to ${laneLabel(pinnedLane).toLowerCase()}.`,
        tone: 'neutral',
      };
    }
  }

  if (liquidity.reserveGapMonths >= 3) {
    return {
      winner: 'reserve',
      verdict: `Fortify reserves first — ${liquidity.reserveGapMonths.toFixed(1)} months below your ${liquidity.targetReserveMonths}-month target.`,
      tone: 'caution',
    };
  }

  const paydownLane = lanes.find((l) => l.lane === 'paydown')!;

  if (acquisitionCoc > liquidity.weightedAvgMortgageRate && acquisitionCoc >= acquisitionCocHurdle) {
    const spread = acquisitionCoc - liquidity.weightedAvgMortgageRate;
    return {
      winner: 'acquisition',
      verdict: `Save for the next purchase — the template deal beats your loan rate by ${formatPercent(spread)}.`,
      tone: 'positive',
    };
  }

  if (liquidity.reserveGapMonths > 0 && liquidity.reserveGapMonths < 3) {
    return {
      winner: 'reserve',
      verdict: `Top off reserves (${liquidity.reserveGapMonths.toFixed(1)} mo short) before accelerating paydown.`,
      tone: 'neutral',
    };
  }

  if (paydownLane.annualizedReturn >= acquisitionCoc) {
    return {
      winner: 'paydown',
      verdict: `Accelerate snowball — ${formatPercent(paydownLane.annualizedReturn)} guaranteed return beats acquisition template.`,
      tone: 'positive',
    };
  }

  return {
    winner: 'acquisition',
    verdict: `Save for the next purchase — template return (${formatPercent(acquisitionCoc)}) beats paying down debt.`,
    tone: 'neutral',
  };
}

export function computeCapitalDeployAnalysis(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder: string[] | null | undefined,
  options: {
    targetReserveMonths: number;
    acquisitionCocHurdle: number;
    deployAmount: number;
    pinnedLane?: DeployLane | null;
  },
): CapitalDeployAnalysis {
  const committed = runActiveSimulation(portfolio, strategyId, customOrder);

  const liquidity = buildLiquiditySnapshot(
    portfolio,
    committed,
    options.targetReserveMonths,
  );

  const acquisition = computeAcquisitionMetrics(portfolio.acquisitionTemplate);
  const deployAnnual = options.deployAmount * 12;
  const paydownInterestSaved = deployAnnual * liquidity.weightedAvgMortgageRate;

  const lanes: DeployLaneMetrics[] = (['paydown', 'reserve', 'acquisition'] as DeployLane[]).map(
    (lane) =>
      scoreLane(
        lane,
        liquidity,
        acquisition.cashOnCash,
        options.acquisitionCocHurdle,
        options.deployAmount,
        paydownInterestSaved,
      ),
  );

  const { winner, verdict, tone } = pickWinner(
    lanes,
    liquidity,
    acquisition.cashOnCash,
    options.acquisitionCocHurdle,
    options.pinnedLane ?? null,
  );

  for (const lane of lanes) {
    lane.isWinner = lane.lane === winner;
  }

  const safeExtraBudgetCeiling = computeSafeExtraBudgetCeiling(liquidity);

  const savingsRate = Math.max(
    liquidity.monthlySurplus,
    portfolio.monthlyReserveTarget,
    options.deployAmount,
    1,
  );
  const monthsToFund =
    acquisition.downPayment > liquidity.cashReserve
      ? (acquisition.downPayment - liquidity.cashReserve) / savingsRate
      : 0;
  const acquisitionFundProgress = Math.min(
    1,
    liquidity.cashReserve / Math.max(acquisition.downPayment, 1),
  );

  return {
    liquidity,
    lanes,
    winner,
    verdict,
    verdictTone: tone,
    safeExtraBudgetCeiling,
    acquisitionDownPayment: acquisition.downPayment,
    acquisitionCocFromTemplate: acquisition.cashOnCash,
    monthsToAcquisitionFund: monthsToFund > 0 ? monthsToFund : null,
    acquisitionFundProgress,
  };
}

export function computeCapitalDeployPreviewDelta(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder: string[] | null | undefined,
  committedDeployAmount: number,
  previewDeployAmount: number,
  prefs: {
    targetReserveMonths: number;
    acquisitionCocHurdle: number;
    pinnedLane?: DeployLane | null;
  },
): CapitalDeployPreviewDelta {
  const committed = computeCapitalDeployAnalysis(portfolio, strategyId, customOrder, {
    ...prefs,
    deployAmount: committedDeployAmount,
  });
  const preview = computeCapitalDeployAnalysis(portfolio, strategyId, customOrder, {
    ...prefs,
    deployAmount: previewDeployAmount,
  });

  const baseline = runActiveSimulation(
    { ...portfolio, extraMonthlyBudget: 0 },
    strategyId,
    customOrder,
  );
  const withCommitted = runActiveSimulation(
    portfolio,
    strategyId,
    customOrder,
    portfolio.extraMonthlyBudget + committedDeployAmount,
  );
  const withPreview = runActiveSimulation(
    portfolio,
    strategyId,
    customOrder,
    portfolio.extraMonthlyBudget + previewDeployAmount,
  );

  return {
    deployAmountCommitted: committedDeployAmount,
    deployAmountPreview: previewDeployAmount,
    winnerCommitted: committed.winner,
    winnerPreview: preview.winner,
    winnerChanged: committed.winner !== preview.winner,
    paydownInterestDelta:
      (baseline.totalInterestPaid - withPreview.totalInterestPaid) -
      (baseline.totalInterestPaid - withCommitted.totalInterestPaid),
    reserveRunwayDelta:
      previewDeployAmount / committed.liquidity.operatingBurn -
      committedDeployAmount / committed.liquidity.operatingBurn,
  };
}

export function laneToneClass(lane: DeployLane, isWinner: boolean): string {
  if (!isWinner) return 'border-white/10 bg-slate-900/40';
  if (lane === 'paydown') return 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-400/30';
  if (lane === 'reserve') return 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-400/30';
  return 'border-cyan-500/50 bg-cyan-500/10 ring-1 ring-cyan-400/30';
}

export function verdictToneClass(tone: DeployVerdictTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}
