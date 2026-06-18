import type { Portfolio, Property } from './types';
import {
  isPropertyActiveAtMonth,
  paymentFromPrincipal,
  propertyGrownOperatingAtMonth,
  propertyGrownRentAtMonth,
  propertyGrownUtilitiesAtMonth,
  resolveCapexRate,
  resolveVacancyRate,
  totalMonthlyExpenses,
} from './snowball';
import {
  balloonMonthForProperty,
  buildFinancingPreview,
  monthsUntilBalloon,
  resolveFinancingType,
} from './propertyFinancing';
import type {
  PropertyRefinanceAnalysis,
  RateShockScenario,
  RefinanceRadarAnalysis,
  RefinanceRadarAssumptions,
  RefinanceReadinessStatus,
} from './refinanceRadarTypes';
import { RATE_SHOCK_BPS } from './refinanceRadarTypes';

const ACTION_WINDOW_MONTHS = 12;

function paymentFromPrincipalLocal(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function grownMarketValue(p: Property, portfolio: Portfolio, month: number): number {
  const months = Math.max(0, month - 1);
  const rate = p.annualAppreciationRate ?? portfolio.annualAppreciationRate ?? 0;
  return p.marketValue * Math.pow(1 + rate / 12, months);
}

function annualNoiAtMonth(
  p: Property,
  portfolio: Portfolio,
  month: number,
): number {
  const vacancy = resolveVacancyRate(p, portfolio, null);
  const grossRent = propertyGrownRentAtMonth(p, portfolio, month);
  const effectiveRent = grossRent * (1 - vacancy);
  const operating = propertyGrownOperatingAtMonth(p, portfolio, month);
  const utilities = propertyGrownUtilitiesAtMonth(p, portfolio, month);
  const netRent =
    effectiveRent - totalMonthlyExpenses(grossRent, operating, utilities);
  return netRent * 12;
}

function classifyStatus(
  dscr: number,
  minDscr: number,
  monthsUntil: number | null,
  rateShocks: RateShockScenario[],
  cashOutProceeds: number,
  analysisMode: 'rate_term' | 'cash_out' | 'both',
): RefinanceReadinessStatus {
  const shockFails = rateShocks.some(
    (s) => s.rateBps > 0 && !s.passesMinDscr,
  );
  const baseFails = dscr < 1;
  const belowMin = dscr < minDscr;

  if (
    (analysisMode === 'cash_out' || analysisMode === 'both') &&
    cashOutProceeds >= 25000 &&
    dscr >= minDscr
  ) {
    return 'cash_out_opportunity';
  }

  if (monthsUntil != null && monthsUntil <= ACTION_WINDOW_MONTHS) {
    if (baseFails) return 'not_refinanceable';
    if (belowMin || shockFails) return 'window_open';
    return 'window_open';
  }

  if (baseFails) return 'not_refinanceable';
  if (belowMin) return 'cushion_tight';
  if (shockFails) return 'rate_shock_risk';
  return 'ready';
}

function actionLabelFor(
  status: RefinanceReadinessStatus,
  propertyName: string,
  monthsUntil: number | null,
  breakEvenMonths: number | null,
  cashOutProceeds: number,
): string {
  const short = propertyName.split('/')[0].trim();
  switch (status) {
    case 'window_open':
      return monthsUntil != null && monthsUntil <= 6
        ? `Start refi prep now — ${short} balloon in ${monthsUntil} mo`
        : `Action window open — begin lender outreach for ${short}`;
    case 'not_refinanceable':
      return `DSCR too weak at refi — pay down ${short} or boost NOI before balloon`;
    case 'cushion_tight':
      return `Thin DSCR cushion — accelerate paydown or rent growth on ${short}`;
    case 'rate_shock_risk':
      return `Rate shock vulnerable — lock terms early or build reserves for ${short}`;
    case 'cash_out_opportunity':
      return `Cash-out window — up to $${Math.round(cashOutProceeds / 1000)}k deployable on ${short}`;
    case 'ready':
      if (breakEvenMonths != null && breakEvenMonths <= 36) {
        return `Favorable rate-term refi — breakeven in ${breakEvenMonths} mo`;
      }
      return `Refi-ready — monitor market for ${short}`;
    default:
      return `Conventional loan — optional cash-out analysis for ${short}`;
  }
}

function priorityScore(
  status: RefinanceReadinessStatus,
  monthsUntil: number | null,
  dscr: number,
): number {
  let score = 0;
  if (status === 'not_refinanceable') score += 100;
  if (status === 'window_open') score += 90;
  if (status === 'cushion_tight') score += 70;
  if (status === 'rate_shock_risk') score += 60;
  if (status === 'cash_out_opportunity') score += 40;
  if (monthsUntil != null) score += Math.max(0, 24 - monthsUntil);
  if (Number.isFinite(dscr) && dscr < 1.25) score += 20;
  return score;
}

function buildRateShocks(
  annualNoi: number,
  principal: number,
  baseRate: number,
  termMonths: number,
  minDscr: number,
): RateShockScenario[] {
  return RATE_SHOCK_BPS.map((bps) => {
    const effectiveRate = baseRate + bps / 10000;
    const monthlyPayment = paymentFromPrincipalLocal(principal, effectiveRate, termMonths);
    const dscr = monthlyPayment > 0 ? annualNoi / (monthlyPayment * 12) : Infinity;
    return {
      label: bps === 0 ? 'Base' : `+${bps} bps`,
      rateBps: bps,
      effectiveRate,
      monthlyPayment,
      dscr,
      passesMinDscr: dscr >= minDscr,
    };
  });
}

function analyzeProperty(
  p: Property,
  portfolio: Portfolio,
  asOfMonth: number,
  assumptions: RefinanceRadarAssumptions,
  analysisMode: 'rate_term' | 'cash_out' | 'both',
): PropertyRefinanceAnalysis | null {
  if (!isPropertyActiveAtMonth(p, asOfMonth) || p.balance <= 0) return null;

  const financingType = resolveFinancingType(p);
  const balloonMonth = balloonMonthForProperty(p);
  const monthsUntil = monthsUntilBalloon(p, asOfMonth);
  const eventMonth =
    financingType === 'seller' && balloonMonth != null
      ? balloonMonth
      : asOfMonth;

  if (financingType === 'conventional' && analysisMode === 'rate_term') {
    return null;
  }

  const preview = buildFinancingPreview(p, portfolio, asOfMonth);
  const marketValueAtEvent = grownMarketValue(p, portfolio, eventMonth);
  const annualNoiAtEvent = annualNoiAtMonth(p, portfolio, eventMonth);

  const refiPrincipal =
    preview.balloonBalanceEstimate ?? p.balance;
  const refiRate = p.balloonRefiAnnualRate ?? assumptions.marketRate;
  const refiTerm = p.balloonRefiTermMonths ?? assumptions.refiTermMonths;
  const effectiveRate = assumptions.marketRate;

  const refiMonthlyPayment = paymentFromPrincipalLocal(
    refiPrincipal,
    effectiveRate,
    refiTerm,
  );
  const currentMonthlyPayment = p.monthlyPayment;
  const monthlyPaymentDelta = refiMonthlyPayment - currentMonthlyPayment;
  const closingCosts = refiPrincipal * assumptions.closingCostPct;
  const monthlySavings = currentMonthlyPayment - refiMonthlyPayment;
  const breakEvenMonths =
    monthlySavings > 0 && closingCosts > 0
      ? Math.ceil(closingCosts / monthlySavings)
      : monthlySavings < 0 && closingCosts > 0
        ? null
        : 0;

  const dscrAtRefi =
    refiMonthlyPayment > 0 ? annualNoiAtEvent / (refiMonthlyPayment * 12) : Infinity;
  const ltvAtRefi = marketValueAtEvent > 0 ? refiPrincipal / marketValueAtEvent : 0;

  const maxCashOutLoan = marketValueAtEvent * assumptions.cashOutLtv;
  const cashOutProceeds = Math.max(0, maxCashOutLoan - refiPrincipal);
  const redeployMonthlyIncome = (cashOutProceeds * assumptions.deploymentYield) / 12;

  const vacancy = resolveVacancyRate(p, portfolio, null);
  const grossRent = propertyGrownRentAtMonth(p, portfolio, eventMonth);
  const effectiveRent = grossRent * (1 - vacancy);
  const operating = propertyGrownOperatingAtMonth(p, portfolio, eventMonth);
  const utilities = propertyGrownUtilitiesAtMonth(p, portfolio, eventMonth);
  const netRent =
    effectiveRent - totalMonthlyExpenses(grossRent, operating, utilities);
  const capexRate = resolveCapexRate(p, portfolio, null);
  const capexFlat = p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat ?? 0;
  const monthlyCapex =
    grossRent * capexRate + capexFlat;
  const netCashflowAfterRefi =
    netRent - refiMonthlyPayment - monthlyCapex + redeployMonthlyIncome;

  const rateShocks = buildRateShocks(
    annualNoiAtEvent,
    refiPrincipal,
    effectiveRate,
    refiTerm,
    assumptions.minDscr,
  );

  const status =
    financingType === 'conventional'
      ? classifyStatus(
          dscrAtRefi,
          assumptions.minDscr,
          null,
          rateShocks,
          cashOutProceeds,
          analysisMode,
        )
      : classifyStatus(
          dscrAtRefi,
          assumptions.minDscr,
          monthsUntil,
          rateShocks,
          cashOutProceeds,
          analysisMode,
        );

  const finalStatus: RefinanceReadinessStatus =
    financingType === 'conventional' && status === 'ready'
      ? 'conventional'
      : status;

  const actionWindowStartMonth =
    balloonMonth != null ? Math.max(asOfMonth, balloonMonth - ACTION_WINDOW_MONTHS) : null;

  return {
    propertyName: p.name,
    status: finalStatus,
    eventMonth: financingType === 'seller' ? balloonMonth : null,
    monthsUntilEvent: monthsUntil,
    actionWindowStartMonth,
    currentBalance: refiPrincipal,
    marketValueAtEvent,
    annualNoiAtEvent,
    currentMonthlyPayment,
    refiMonthlyPayment,
    monthlyPaymentDelta,
    closingCosts,
    breakEvenMonths,
    dscrAtRefi,
    ltvAtRefi,
    maxCashOutLoan,
    cashOutProceeds,
    redeployMonthlyIncome,
    netCashflowAfterRefi,
    rateShocks,
    actionLabel: actionLabelFor(
      finalStatus,
      p.name,
      monthsUntil,
      breakEvenMonths,
      cashOutProceeds,
    ),
    priorityScore: priorityScore(finalStatus, monthsUntil, dscrAtRefi),
  };
}

export function buildRefinanceRadarAnalysis(
  portfolio: Portfolio,
  assumptions: RefinanceRadarAssumptions,
  analysisMode: 'rate_term' | 'cash_out' | 'both' = 'both',
  asOfMonth = 1,
): RefinanceRadarAnalysis {
  const modeFilter = analysisMode;
  const properties = portfolio.properties
    .map((p) => analyzeProperty(p, portfolio, asOfMonth, assumptions, modeFilter))
    .filter((row): row is PropertyRefinanceAnalysis => row != null)
    .filter((row) => {
      if (modeFilter === 'rate_term') {
        return row.eventMonth != null || row.status !== 'conventional';
      }
      if (modeFilter === 'cash_out') {
        return (
          row.status === 'cash_out_opportunity' ||
          row.cashOutProceeds > 0 ||
          row.status === 'conventional'
        );
      }
      return true;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const urgentCount = properties.filter(
    (p) => p.status === 'window_open' || p.status === 'not_refinanceable',
  ).length;
  const opportunityCount = properties.filter(
    (p) => p.status === 'cash_out_opportunity' || p.status === 'ready',
  ).length;
  const blockedCount = properties.filter(
    (p) => p.status === 'not_refinanceable' || p.status === 'cushion_tight',
  ).length;

  const portfolioCashOutCapacity = properties.reduce(
    (sum, p) => sum + Math.max(0, p.cashOutProceeds),
    0,
  );

  let verdict: string;
  let verdictTone: RefinanceRadarAnalysis['verdictTone'] = 'neutral';

  if (urgentCount > 0) {
    verdict = `${urgentCount} propert${urgentCount === 1 ? 'y needs' : 'ies need'} refi action within 12 months — start lender outreach now.`;
    verdictTone = 'severe';
  } else if (blockedCount > 0) {
    verdict = `${blockedCount} propert${blockedCount === 1 ? 'y has' : 'ies have'} weak refi math — strengthen DSCR before maturity.`;
    verdictTone = 'caution';
  } else if (opportunityCount > 0) {
    verdict = `Portfolio refi-ready with $${Math.round(portfolioCashOutCapacity / 1000)}k potential cash-out capacity at current assumptions.`;
    verdictTone = 'positive';
  } else {
    verdict = 'No urgent refi windows — monitor rate shocks and balloon dates.';
    verdictTone = 'neutral';
  }

  return {
    properties,
    urgentCount,
    opportunityCount,
    blockedCount,
    verdict,
    verdictTone,
    portfolioCashOutCapacity,
  };
}

export function reorderForRefinanceRadar(
  propertyNames: string[],
  analysis: RefinanceRadarAnalysis,
): string[] {
  const priority = new Map(
    analysis.properties.map((p, idx) => [p.propertyName, analysis.properties.length - idx]),
  );
  return [...propertyNames].sort((a, b) => (priority.get(b) ?? 0) - (priority.get(a) ?? 0));
}
