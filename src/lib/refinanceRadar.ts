import type { Portfolio, Property } from './types';
import {
  paymentFromPrincipal,
  resolveMonthlyExpenses,
  resolveMonthlyUtilities,
  resolveVacancyRate,
  totalMonthlyExpenses,
} from './snowball';
import { monthsUntilBalloon, resolveFinancingType } from './propertyFinancing';
import { formatCurrency, formatMonths } from './format';
import type {
  PropertyRefinanceOpportunity,
  RefinanceRadarAnalysis,
  RefinanceRadarAssumptions,
  RefinanceRadarPreferences,
  RefinanceVerdict,
} from './refinanceRadarTypes';

export const DEFAULT_REFINANCE_ASSUMPTIONS: RefinanceRadarAssumptions = {
  marketRate: 0.07,
  closingCostPct: 0.025,
  holdPeriodMonths: 60,
  cashOutLtv: 0.75,
  minDscr: 1.0,
  deploymentYield: 0.12,
  refiTermMonths: 360,
  analysisMode: 'both',
};

export function preferencesToAssumptions(
  prefs: Pick<
    RefinanceRadarPreferences,
    | 'analysisMode'
    | 'marketRate'
    | 'closingCostPct'
    | 'holdPeriodMonths'
    | 'cashOutLtv'
    | 'minDscr'
    | 'deploymentYield'
    | 'refiTermMonths'
  >,
): RefinanceRadarAssumptions {
  return {
    analysisMode: prefs.analysisMode,
    marketRate: prefs.marketRate,
    closingCostPct: prefs.closingCostPct,
    holdPeriodMonths: prefs.holdPeriodMonths,
    cashOutLtv: prefs.cashOutLtv,
    minDscr: prefs.minDscr,
    deploymentYield: prefs.deploymentYield,
    refiTermMonths: prefs.refiTermMonths,
  };
}

function annualNoi(p: Property, portfolio: Portfolio): number {
  const vacancy = resolveVacancyRate(p, portfolio);
  const effectiveRent = p.monthlyRent * (1 - vacancy);
  const operating = resolveMonthlyExpenses(p);
  const totalExpenses = totalMonthlyExpenses(
    p.monthlyRent,
    operating,
    resolveMonthlyUtilities(p),
  );
  return (effectiveRent - totalExpenses) * 12;
}

function dscrForPayment(noi: number, monthlyPayment: number): number {
  const debtService = monthlyPayment * 12;
  if (debtService <= 0) return Infinity;
  return noi / debtService;
}

function classifyRateTermVerdict(
  monthlySavings: number,
  breakEvenMonths: number | null,
  rateImprovementBps: number,
  holdPeriodMonths: number,
): { verdict: RefinanceVerdict; rationale: string } {
  if (monthlySavings <= 0) {
    return {
      verdict: 'skip',
      rationale: 'Market rate is not lower than your current note — no payment savings.',
    };
  }
  if (breakEvenMonths == null) {
    return { verdict: 'skip', rationale: 'Unable to compute break-even.' };
  }
  if (breakEvenMonths <= 36 && rateImprovementBps >= 50) {
    return {
      verdict: 'strong',
      rationale: `Break-even in ${formatMonths(breakEvenMonths)} with ${(rateImprovementBps / 100).toFixed(2)}% rate improvement.`,
    };
  }
  if (breakEvenMonths <= 60 && holdPeriodMonths > breakEvenMonths) {
    return {
      verdict: 'marginal',
      rationale: `Break-even in ${formatMonths(breakEvenMonths)} — workable if you hold past that point.`,
    };
  }
  return {
    verdict: 'skip',
    rationale: `Break-even in ${formatMonths(breakEvenMonths)} exceeds typical hold window.`,
  };
}

function classifyCashOutVerdict(
  cashOutNet: number | null,
  cashOutDscr: number | null,
  minDscr: number,
  cashOutMonthlyDelta: number | null,
  netAnnualYield: number | null,
  deploymentYield: number,
): { verdict: RefinanceVerdict; rationale: string } {
  if (cashOutNet == null || cashOutNet <= 0) {
    return { verdict: 'skip', rationale: 'Insufficient equity for a net cash-out at this LTV cap.' };
  }
  if (cashOutDscr != null && cashOutDscr < minDscr) {
    return {
      verdict: 'blocked',
      rationale: `Post-refi DSCR ${cashOutDscr.toFixed(2)} is below your ${minDscr.toFixed(2)} minimum.`,
    };
  }
  if (netAnnualYield != null && netAnnualYield >= deploymentYield) {
    return {
      verdict: 'strong',
      rationale: `Net deployment yield ~${(netAnnualYield * 100).toFixed(1)}% clears your ${(deploymentYield * 100).toFixed(0)}% hurdle.`,
    };
  }
  if (cashOutMonthlyDelta != null && cashOutMonthlyDelta <= 0) {
    return {
      verdict: 'marginal',
      rationale: `Pulls ${formatCurrency(cashOutNet)} but redeployment yield may not clear carrying cost.`,
    };
  }
  return {
    verdict: 'marginal',
    rationale: 'Cash available, but monthly payment rises — verify deployment plan.',
  };
}

function pickPrimaryVerdict(
  rateTerm: RefinanceVerdict,
  cashOut: RefinanceVerdict,
  mode: RefinanceRadarAssumptions['analysisMode'],
): RefinanceVerdict {
  const rank: Record<RefinanceVerdict, number> = {
    strong: 5,
    marginal: 4,
    balloon_pending: 3,
    blocked: 2,
    skip: 1,
  };
  if (mode === 'rate_term') return rateTerm;
  if (mode === 'cash_out') return cashOut;
  return rank[rateTerm] >= rank[cashOut] ? rateTerm : cashOut;
}

function headlineForProperty(row: PropertyRefinanceOpportunity): string {
  if (row.primaryVerdict === 'strong') {
    if (row.monthlySavings != null && row.monthlySavings > 0) {
      return `Save ${formatCurrency(row.monthlySavings)}/mo · break-even ${row.breakEvenMonths != null ? formatMonths(row.breakEvenMonths) : '—'}`;
    }
    if (row.cashOutNet != null && row.cashOutNet > 0) {
      return `Extract ${formatCurrency(row.cashOutNet)} net at ${(row.cashOutDscr ?? 0).toFixed(2)} DSCR`;
    }
  }
  if (row.primaryVerdict === 'marginal') return row.rateTermRationale || row.cashOutRationale;
  if (row.primaryVerdict === 'blocked') return row.cashOutRationale;
  if (row.primaryVerdict === 'balloon_pending') {
    return row.monthsUntilBalloon != null
      ? `Balloon refi in ${formatMonths(row.monthsUntilBalloon)} — plan now`
      : 'Seller note — forced refi approaching';
  }
  return row.rateTermRationale || row.cashOutRationale;
}

function analyzeProperty(
  p: Property,
  portfolio: Portfolio,
  assumptions: RefinanceRadarAssumptions,
  asOfMonth = 1,
): PropertyRefinanceOpportunity | null {
  if (p.balance <= 0 || p.marketValue <= 0) return null;

  const financingType = resolveFinancingType(p);
  const isSellerFinancing = financingType === 'seller';
  const balloonLeft = isSellerFinancing ? monthsUntilBalloon(p, asOfMonth) : null;

  const noi = annualNoi(p, portfolio);
  const currentDscr = dscrForPayment(noi, p.monthlyPayment);
  const ltv = p.balance / p.marketValue;
  const closingCosts = p.balance * assumptions.closingCostPct;
  const effectiveRate = isSellerFinancing
    ? (p.balloonRefiAnnualRate ?? p.annualInterestRate)
    : p.annualInterestRate;

  if (isSellerFinancing && balloonLeft != null && balloonLeft > 12) {
    const rateTermVerdict: RefinanceVerdict = 'balloon_pending';
    const row: PropertyRefinanceOpportunity = {
      propertyName: p.name,
      balance: p.balance,
      marketValue: p.marketValue,
      currentRate: p.annualInterestRate,
      currentPayment: p.monthlyPayment,
      ltv,
      currentDscr,
      isSellerFinancing: true,
      monthsUntilBalloon: balloonLeft,
      rateTermNewPayment: null,
      monthlySavings: null,
      rateImprovementBps: null,
      closingCosts,
      breakEvenMonths: null,
      holdPeriodNetBenefit: null,
      rateTermVerdict,
      rateTermRationale: `Seller note — evaluate refi terms before balloon in ${formatMonths(balloonLeft)}.`,
      maxLoanAmount: null,
      cashOutGross: null,
      cashOutNet: null,
      cashOutNewPayment: null,
      cashOutDscr: null,
      cashOutMonthlyDelta: null,
      cashOutNetAnnualYield: null,
      cashOutVerdict: 'balloon_pending',
      cashOutRationale: 'Cash-out analysis deferred until balloon refi window.',
      primaryVerdict: 'balloon_pending',
      headline: '',
    };
    row.headline = headlineForProperty(row);
    return row;
  }

  const refiBalance = p.balance;
  const rateTermNewPayment = paymentFromPrincipal(
    refiBalance,
    assumptions.marketRate,
    assumptions.refiTermMonths,
  );
  const monthlySavings = p.monthlyPayment - rateTermNewPayment;
  const rateImprovementBps = Math.round((effectiveRate - assumptions.marketRate) * 10000);
  const breakEvenMonths =
    monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : null;
  const holdPeriodNetBenefit =
    monthlySavings > 0
      ? monthlySavings * assumptions.holdPeriodMonths - closingCosts
      : null;

  const { verdict: rateTermVerdict, rationale: rateTermRationale } = classifyRateTermVerdict(
    monthlySavings,
    breakEvenMonths,
    rateImprovementBps,
    assumptions.holdPeriodMonths,
  );

  const maxLoanAmount = p.marketValue * assumptions.cashOutLtv;
  const cashOutGross = Math.max(0, maxLoanAmount - refiBalance);
  const cashOutClosing = maxLoanAmount * assumptions.closingCostPct;
  const cashOutNet = cashOutGross > 0 ? cashOutGross - cashOutClosing : 0;
  const cashOutNewPayment =
    maxLoanAmount > 0
      ? paymentFromPrincipal(maxLoanAmount, assumptions.marketRate, assumptions.refiTermMonths)
      : null;
  const cashOutDscr =
    cashOutNewPayment != null ? dscrForPayment(noi, cashOutNewPayment) : null;
  const cashOutMonthlyDelta =
    cashOutNewPayment != null ? cashOutNewPayment - p.monthlyPayment : null;
  const extraAnnualCost =
    cashOutMonthlyDelta != null && cashOutMonthlyDelta > 0
      ? cashOutMonthlyDelta * 12
      : 0;
  const deploymentAnnualReturn =
    cashOutNet != null && cashOutNet > 0 ? cashOutNet * assumptions.deploymentYield : 0;
  const cashOutNetAnnualYield =
    cashOutNet != null && cashOutNet > 0
      ? (deploymentAnnualReturn - extraAnnualCost) / cashOutNet
      : null;

  const { verdict: cashOutVerdict, rationale: cashOutRationale } = classifyCashOutVerdict(
    cashOutNet,
    cashOutDscr,
    assumptions.minDscr,
    cashOutMonthlyDelta,
    cashOutNetAnnualYield,
    assumptions.deploymentYield,
  );

  const primaryVerdict = pickPrimaryVerdict(
    rateTermVerdict,
    cashOutVerdict,
    assumptions.analysisMode,
  );

  const row: PropertyRefinanceOpportunity = {
    propertyName: p.name,
    balance: p.balance,
    marketValue: p.marketValue,
    currentRate: effectiveRate,
    currentPayment: p.monthlyPayment,
    ltv,
    currentDscr,
    isSellerFinancing,
    monthsUntilBalloon: balloonLeft,
    rateTermNewPayment,
    monthlySavings,
    rateImprovementBps,
    closingCosts,
    breakEvenMonths,
    holdPeriodNetBenefit,
    rateTermVerdict,
    rateTermRationale,
    maxLoanAmount,
    cashOutGross,
    cashOutNet: cashOutNet > 0 ? cashOutNet : null,
    cashOutNewPayment,
    cashOutDscr,
    cashOutMonthlyDelta,
    cashOutNetAnnualYield,
    cashOutVerdict,
    cashOutRationale,
    primaryVerdict,
    headline: '',
  };
  row.headline = headlineForProperty(row);
  return row;
}

export function buildRefinanceRadarAnalysis(
  portfolio: Portfolio,
  assumptions: RefinanceRadarAssumptions,
  asOfMonth = 1,
): RefinanceRadarAnalysis {
  const properties = portfolio.properties
    .map((p) => analyzeProperty(p, portfolio, assumptions, asOfMonth))
    .filter((row): row is PropertyRefinanceOpportunity => row != null)
    .sort((a, b) => {
      const rank: Record<RefinanceVerdict, number> = {
        strong: 5,
        marginal: 4,
        balloon_pending: 3,
        blocked: 2,
        skip: 1,
      };
      const diff = rank[b.primaryVerdict] - rank[a.primaryVerdict];
      if (diff !== 0) return diff;
      return (b.monthlySavings ?? 0) - (a.monthlySavings ?? 0);
    });

  const strongCount = properties.filter((p) => p.primaryVerdict === 'strong').length;
  const marginalCount = properties.filter((p) => p.primaryVerdict === 'marginal').length;
  const skipCount = properties.filter((p) => p.primaryVerdict === 'skip').length;
  const blockedCount = properties.filter((p) => p.primaryVerdict === 'blocked').length;

  const totalMonthlySavingsPotential = properties
    .filter((p) => p.rateTermVerdict === 'strong' || p.rateTermVerdict === 'marginal')
    .reduce((sum, p) => sum + Math.max(0, p.monthlySavings ?? 0), 0);

  const totalCashOutPotential = properties
    .filter((p) => p.cashOutVerdict === 'strong' || p.cashOutVerdict === 'marginal')
    .reduce((sum, p) => sum + (p.cashOutNet ?? 0), 0);

  let verdict: string;
  let verdictTone: RefinanceRadarAnalysis['verdictTone'] = 'neutral';

  if (strongCount > 0) {
    verdict = `${strongCount} propert${strongCount === 1 ? 'y' : 'ies'} with strong refi signal — up to ${formatCurrency(totalMonthlySavingsPotential)}/mo savings and ${formatCurrency(totalCashOutPotential)} deployable.`;
    verdictTone = 'positive';
  } else if (marginalCount > 0) {
    verdict = `${marginalCount} marginal opportunit${marginalCount === 1 ? 'y' : 'ies'} — tighten assumptions or wait for a wider rate spread.`;
    verdictTone = 'caution';
  } else if (blockedCount > 0) {
    verdict = `${blockedCount} propert${blockedCount === 1 ? 'y' : 'ies'} blocked by DSCR at target LTV — reduce cash-out or improve NOI first.`;
    verdictTone = 'caution';
  } else {
    verdict = 'No compelling refi windows at current market assumptions — your notes are competitive.';
    verdictTone = 'neutral';
  }

  return {
    properties,
    eligibleCount: properties.length,
    strongCount,
    marginalCount,
    skipCount,
    blockedCount,
    totalMonthlySavingsPotential,
    totalCashOutPotential,
    verdict,
    verdictTone,
    assumptions,
  };
}

export function verdictLabel(verdict: RefinanceVerdict): string {
  switch (verdict) {
    case 'strong':
      return 'Strong';
    case 'marginal':
      return 'Marginal';
    case 'blocked':
      return 'DSCR blocked';
    case 'balloon_pending':
      return 'Balloon pending';
    default:
      return 'Skip';
  }
}

export function verdictToneClass(verdict: RefinanceVerdict): string {
  if (verdict === 'strong') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (verdict === 'marginal' || verdict === 'balloon_pending') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }
  if (verdict === 'blocked') return 'border-red-500/40 bg-red-500/10 text-red-200';
  return 'border-white/10 bg-white/[0.02] text-slate-300';
}
