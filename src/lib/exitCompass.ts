import type { Portfolio, Property, TaxProfile } from './types';
import {
  runSimulation,
  runSimulationWithPayoffOrder,
  type StrategyId,
} from './snowball';
import {
  computeOngoingAnnualDepreciation,
  computeFirstYearDepreciation,
  classifyPropertyForTaxYear,
} from './tax';
import type {
  ExitCompassAnalysis,
  ExitCompassAssumptions,
  ExitCompassPreviewDelta,
  ExitPathMetrics,
  ExitTaxBreakdown,
  ExitVerdict,
  PropertyExitAnalysis,
  ExitCompassPreferences,
} from './exitCompassTypes';

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

function formatMonths(months: number): string {
  if (months <= 0) return 'now';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

function resolvePurchasePrice(p: Property): number {
  return p.purchasePrice ?? p.marketValue;
}

function resolveServiceYear(p: Property, taxYear: number): number {
  return p.placedInServiceYear ?? p.closeYear ?? taxYear - 3;
}

function computeAccumulatedDepreciation(p: Property, taxProfile: TaxProfile): number {
  const serviceYear = resolveServiceYear(p, taxProfile.taxYear);
  const yearsHeld = Math.max(1, taxProfile.taxYear - serviceYear + 1);
  let total = 0;

  for (let y = 0; y < yearsHeld; y += 1) {
    const year = serviceYear + y;
    const category = classifyPropertyForTaxYear(
      { ...p, placedInServiceYear: serviceYear },
      year,
    );
    if (category === 'future') continue;

    const dep =
      category === 'newAcquisition' && year === serviceYear
        ? computeFirstYearDepreciation(p, { ...taxProfile, taxYear: year })
        : computeOngoingAnnualDepreciation(p, year);
    total += dep.total;
  }

  return total;
}

export function computeExitTaxBreakdown(
  p: Property,
  taxProfile: TaxProfile,
  assumptions: Pick<
    ExitCompassAssumptions,
    'closingCostPct' | 'capitalGainsRate' | 'recaptureRate'
  >,
): ExitTaxBreakdown {
  const grossSalePrice = p.marketValue;
  const sellingCosts = grossSalePrice * assumptions.closingCostPct;
  const loanPayoff = p.balance;
  const purchasePrice = resolvePurchasePrice(p);
  const accumulatedDepreciation = computeAccumulatedDepreciation(p, taxProfile);
  const adjustedBasis = Math.max(0, purchasePrice - accumulatedDepreciation);
  const amountRealized = grossSalePrice - sellingCosts;
  const totalGain = Math.max(0, amountRealized - adjustedBasis);
  const depreciationRecapture = Math.min(accumulatedDepreciation, totalGain);
  const capitalGain = Math.max(0, totalGain - depreciationRecapture);
  const recaptureTax = depreciationRecapture * assumptions.recaptureRate;
  const stateRate = taxProfile.stateTaxRate ?? 0;
  const capitalGainsTax = capitalGain * (assumptions.capitalGainsRate + stateRate);
  const totalTax = recaptureTax + capitalGainsTax;

  return {
    grossSalePrice,
    sellingCosts,
    loanPayoff,
    adjustedBasis,
    accumulatedDepreciation,
    totalGain,
    depreciationRecapture,
    recaptureTax,
    capitalGain,
    capitalGainsTax,
    stateTax: capitalGain * stateRate,
    totalTax,
  };
}

function propertyAnnualCashflow(p: Property, portfolio: Portfolio): number {
  const grossRent = p.monthlyRent * 12 * (1 - (p.vacancyRate ?? portfolio.defaultVacancyRate));
  const capexRate = p.capexReserveRate ?? portfolio.defaultCapexReserveRate;
  const capexFlat = (p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat) * 12;
  const capex = p.monthlyRent * 12 * capexRate + capexFlat;
  const expenses = p.monthlyExpenses * 12 + capex;
  const debtService = p.monthlyPayment * 12;
  return grossRent - expenses - debtService;
}

function effectiveClosingRateForProceeds(
  marketValue: number,
  balance: number,
  netProceedsToDebt: number,
): number {
  if (marketValue <= 0) return 0.06;
  const grossToDebt = netProceedsToDebt + balance;
  return Math.min(0.99, Math.max(0, 1 - grossToDebt / marketValue));
}

function runSellSimulation(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder: string[] | null | undefined,
  propertyName: string,
  sellAtMonth: number,
  closingCostRate: number,
  proceedsToDebtPct: number,
) {
  const scenario = {
    id: `exit-${propertyName}`,
    label: `Sell ${propertyName}`,
    sellProperty: propertyName,
    sellAtMonth,
    sellClosingCostRate: closingCostRate,
    sellProceedsToDebt: proceedsToDebtPct,
  };

  if (customOrder && customOrder.length > 0) {
    return runSimulationWithPayoffOrder(portfolio, customOrder, scenario);
  }
  return runSimulation(portfolio, strategyId, scenario);
}

function projectHoldWealth(
  p: Property,
  portfolio: Portfolio,
  horizonMonths: number,
): number {
  const annualCashflow = propertyAnnualCashflow(p, portfolio);
  const appreciation = p.annualAppreciationRate ?? portfolio.annualRentGrowthRate;
  const years = horizonMonths / 12;
  const futureValue = p.marketValue * (1 + appreciation) ** years;
  const principalPaid = Math.min(p.balance, p.monthlyPayment * 12 * years * 0.35);
  const futureBalance = Math.max(0, p.balance - principalPaid);
  const cashflowAccum = annualCashflow * years;
  return futureValue - futureBalance + cashflowAccum;
}

function buildPathMetrics(
  path: 'hold' | 'sell' | 'exchange',
  p: Property,
  portfolio: Portfolio,
  tax: ExitTaxBreakdown,
  assumptions: ExitCompassAssumptions,
  snowballBaseline: ReturnType<typeof runSimulation>,
  snowballSell: ReturnType<typeof runSimulation> | null,
): ExitPathMetrics {
  const preTaxEquity = tax.grossSalePrice - tax.sellingCosts - tax.loanPayoff;
  const afterTaxNet = preTaxEquity - tax.totalTax;
  const exchangeNet = preTaxEquity;

  if (path === 'hold') {
    const equity = p.marketValue - p.balance;
    const roe = equity > 0 ? propertyAnnualCashflow(p, portfolio) / equity : 0;
    const wealth = projectHoldWealth(p, portfolio, assumptions.holdHorizonMonths);
    return {
      path: 'hold',
      label: 'Hold',
      netProceeds: 0,
      trueNetEquity: equity,
      taxLiability: 0,
      projectedWealthAtHorizon: wealth,
      annualizedReturn: roe,
      snowballMonthsDelta: null,
      snowballInterestSaved: null,
      headline: `${formatPercent(roe)} return on equity`,
      subline: `Projected ${formatCurrencyShort(wealth)} wealth at ${formatMonths(assumptions.holdHorizonMonths)} horizon`,
      isRecommended: false,
    };
  }

  const netProceeds = path === 'sell' ? afterTaxNet : exchangeNet;
  const taxLiability = path === 'sell' ? tax.totalTax : 0;
  const monthsDelta =
    snowballSell != null
      ? snowballBaseline.monthsToPayoff - snowballSell.monthsToPayoff
      : null;
  const interestSaved =
    snowballSell != null
      ? snowballBaseline.totalInterestPaid - snowballSell.totalInterestPaid
      : null;

  const headline =
    path === 'sell'
      ? `${formatCurrencyShort(afterTaxNet)} true net equity`
      : `${formatCurrencyShort(exchangeNet)} tax-deferred equity`;

  let subline = '';
  if (monthsDelta != null && monthsDelta > 0) {
    subline = `Accelerates debt-free by ${formatMonths(monthsDelta)} · saves ${formatCurrencyShort(interestSaved ?? 0)} interest`;
  } else if (monthsDelta != null && monthsDelta < 0) {
    subline = `Delays debt-free by ${formatMonths(Math.abs(monthsDelta))} — weak snowball candidate`;
  } else {
    subline = `Reinvest ${formatCurrencyShort(netProceeds * assumptions.proceedsToDebtPct)} into snowball at month ${assumptions.sellAtMonth}`;
  }

  return {
    path,
    label: path === 'sell' ? 'Sell' : '1031 Exchange',
    netProceeds,
    trueNetEquity: netProceeds,
    taxLiability,
    projectedWealthAtHorizon: netProceeds,
    annualizedReturn: 0,
    snowballMonthsDelta: monthsDelta,
    snowballInterestSaved: interestSaved,
    headline,
    subline,
    isRecommended: false,
  };
}

function verdictForProperty(
  paths: ExitPathMetrics[],
  roe: number,
): { verdict: ExitVerdict; headline: string; rankScore: number } {
  const sell = paths.find((p) => p.path === 'sell')!;
  const exchange = paths.find((p) => p.path === 'exchange')!;

  const sellMonthsDelta = sell.snowballMonthsDelta ?? 0;
  const exchangeMonthsDelta = exchange.snowballMonthsDelta ?? 0;
  const bestExitDelta = Math.max(sellMonthsDelta, exchangeMonthsDelta);
  const taxDrag = sell.taxLiability;
  const taxDragPct = sell.trueNetEquity > 0 ? taxDrag / (sell.trueNetEquity + taxDrag) : 0;

  let verdict: ExitVerdict = 'hold';
  let headline = `Hold — ${formatPercent(roe)} ROE justifies keeping`;

  if (roe < 0.04 && bestExitDelta >= 6) {
    verdict = 'strong_exit';
    headline = `Strong exit — low ROE (${formatPercent(roe)}) and ${formatMonths(bestExitDelta)} snowball acceleration`;
  } else if (bestExitDelta >= 12 && taxDragPct < 0.25) {
    verdict = 'strong_exit';
    headline = `Prime exit window — ${formatMonths(bestExitDelta)} faster debt-free with manageable tax drag`;
  } else if (bestExitDelta >= 3 || (roe < 0.06 && taxDragPct < 0.35)) {
    verdict = 'consider_exit';
    headline = `Consider exit — ${formatCurrencyShort(sell.trueNetEquity)} net equity vs ${formatPercent(roe)} hold ROE`;
  } else if (roe >= 0.1) {
    verdict = 'hold';
    headline = `Hold — strong ${formatPercent(roe)} ROE outweighs exit benefit`;
  }

  const rankScore =
    bestExitDelta * 10 +
    (roe < 0.06 ? 30 : 0) +
    sell.trueNetEquity / 10000 -
    taxDragPct * 50;

  return { verdict, headline, rankScore };
}

export function preferencesToAssumptions(
  prefs: ExitCompassPreferences,
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

export function buildExitCompassAnalysis(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder: string[] | null | undefined,
  assumptions: ExitCompassAssumptions,
): ExitCompassAnalysis {
  const taxProfile = portfolio.taxProfile;
  const baseline = customOrder?.length
    ? runSimulationWithPayoffOrder(portfolio, customOrder, null)
    : runSimulation(portfolio, strategyId, null);

  const properties: PropertyExitAnalysis[] = portfolio.properties.map((p) => {
    const tax = computeExitTaxBreakdown(p, taxProfile, assumptions);
    const equity = p.marketValue - p.balance;
    const roe = equity > 0 ? propertyAnnualCashflow(p, portfolio) / equity : 0;
    const serviceYear = resolveServiceYear(p, taxProfile.taxYear);
    const yearsHeld = Math.max(1, taxProfile.taxYear - serviceYear + 1);

    const afterTaxProceeds = equity - tax.sellingCosts - tax.totalTax;
    const sellClosingRate = effectiveClosingRateForProceeds(
      p.marketValue,
      p.balance,
      afterTaxProceeds * assumptions.proceedsToDebtPct,
    );
    const exchangeClosingRate = effectiveClosingRateForProceeds(
      p.marketValue,
      p.balance,
      (equity - tax.sellingCosts) * assumptions.proceedsToDebtPct,
    );

    const sellSim = runSellSimulation(
      portfolio,
      strategyId,
      customOrder,
      p.name,
      assumptions.sellAtMonth,
      sellClosingRate,
      assumptions.proceedsToDebtPct,
    );

    const exchangeSim = runSellSimulation(
      portfolio,
      strategyId,
      customOrder,
      p.name,
      assumptions.sellAtMonth,
      exchangeClosingRate,
      assumptions.proceedsToDebtPct,
    );

    const paths: ExitPathMetrics[] = [
      buildPathMetrics('hold', p, portfolio, tax, assumptions, baseline, null),
      buildPathMetrics('sell', p, portfolio, tax, assumptions, baseline, sellSim),
      buildPathMetrics('exchange', p, portfolio, tax, assumptions, baseline, exchangeSim),
    ];

    const { verdict, headline, rankScore } = verdictForProperty(paths, roe);

    const bestPath = [...paths]
      .filter((path) => path.path !== 'hold')
      .sort((a, b) => (b.snowballMonthsDelta ?? 0) - (a.snowballMonthsDelta ?? 0))[0];
    if (bestPath && (bestPath.snowballMonthsDelta ?? 0) > 0) {
      paths.forEach((path) => {
        path.isRecommended = path.path === bestPath.path;
      });
    }

    return {
      propertyName: p.name,
      marketValue: p.marketValue,
      balance: p.balance,
      equity,
      ltv: p.marketValue > 0 ? p.balance / p.marketValue : 0,
      returnOnEquity: roe,
      annualCashflow: propertyAnnualCashflow(p, portfolio),
      yearsHeld,
      taxBreakdown: tax,
      paths,
      primaryVerdict: verdict,
      headline,
      rankScore,
    };
  });

  properties.sort((a, b) => b.rankScore - a.rankScore);

  const topExitCandidate =
    properties.find((p) => p.primaryVerdict === 'strong_exit' || p.primaryVerdict === 'consider_exit')
      ?.propertyName ?? properties[0]?.propertyName ?? null;

  const exitCount = properties.filter(
    (p) => p.primaryVerdict === 'strong_exit' || p.primaryVerdict === 'consider_exit',
  ).length;
  const holdCount = properties.length - exitCount;
  const totalTaxExposure = properties.reduce((s, p) => s + p.taxBreakdown.totalTax, 0);
  const totalTrueNetEquity = properties.reduce(
    (s, p) => s + (p.marketValue - p.balance - p.taxBreakdown.sellingCosts - p.taxBreakdown.totalTax),
    0,
  );

  let verdict = 'All properties favor hold at current assumptions.';
  let verdictTone: 'positive' | 'caution' | 'neutral' = 'neutral';

  if (exitCount > 0 && topExitCandidate) {
    const top = properties.find((p) => p.propertyName === topExitCandidate)!;
    const sellPath = top.paths.find((path) => path.path === 'sell')!;
    verdict = `${topExitCandidate} leads exit radar — ${sellPath.headline}, ${sellPath.subline}`;
    verdictTone = top.primaryVerdict === 'strong_exit' ? 'positive' : 'caution';
  }

  return {
    properties,
    topExitCandidate,
    holdCount,
    exitCount,
    totalTaxExposure,
    totalTrueNetEquity,
    verdict,
    verdictTone,
    assumptions,
  };
}

export function computeExitCompassPreviewDelta(
  portfolio: Portfolio,
  strategyId: StrategyId,
  customOrder: string[] | null | undefined,
  propertyName: string,
  assumptions: ExitCompassAssumptions,
): ExitCompassPreviewDelta | null {
  const p = portfolio.properties.find((prop) => prop.name === propertyName);
  if (!p) return null;

  const tax = computeExitTaxBreakdown(p, portfolio.taxProfile, assumptions);
  const equity = p.marketValue - p.balance;
  const afterTaxProceeds = equity - tax.sellingCosts - tax.totalTax;
  const exchangeProceeds = equity - tax.sellingCosts;

  const baseline = customOrder?.length
    ? runSimulationWithPayoffOrder(portfolio, customOrder, null)
    : runSimulation(portfolio, strategyId, null);

  const sellClosingRate = effectiveClosingRateForProceeds(
    p.marketValue,
    p.balance,
    afterTaxProceeds * assumptions.proceedsToDebtPct,
  );

  const sellSim = runSellSimulation(
    portfolio,
    strategyId,
    customOrder,
    propertyName,
    assumptions.sellAtMonth,
    sellClosingRate,
    assumptions.proceedsToDebtPct,
  );

  return {
    propertyName,
    baselineMonthsToPayoff: baseline.monthsToPayoff,
    sellMonthsToPayoff: sellSim.monthsToPayoff,
    monthsDelta: baseline.monthsToPayoff - sellSim.monthsToPayoff,
    interestSaved: baseline.totalInterestPaid - sellSim.totalInterestPaid,
    afterTaxProceeds,
    exchangeProceeds,
  };
}

export function verdictLabel(verdict: ExitVerdict): string {
  if (verdict === 'strong_exit') return 'Strong exit';
  if (verdict === 'consider_exit') return 'Consider exit';
  if (verdict === 'blocked') return 'Blocked';
  return 'Hold';
}

export function verdictToneClass(verdict: ExitVerdict): string {
  if (verdict === 'strong_exit') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (verdict === 'consider_exit') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  if (verdict === 'blocked') return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
}

export function pathToneClass(path: ExitPathMetrics): string {
  if (path.isRecommended) return 'border-emerald-400/50 bg-emerald-500/10 ring-1 ring-emerald-400/20';
  if (path.path === 'hold') return 'border-white/10 bg-slate-900/40';
  if (path.path === 'exchange') return 'border-violet-500/30 bg-violet-500/5';
  return 'border-white/10 bg-slate-900/40';
}
