import type { Portfolio, Property } from './types';
import { computeSellerFinancingTerms } from './snowball';
import { formatCurrency, formatMonths } from './format';

export type FinancingType = 'conventional' | 'seller';

export interface PropertyFinancingPatch {
  financingType?: FinancingType;
  balloonMonths?: number;
  sellerAmortizationMonths?: number;
  sellerPayoffCap?: number;
  balloonRefiAnnualRate?: number;
  balloonRefiTermMonths?: number;
  sellerCredit?: number;
  balance?: number;
  monthlyPayment?: number;
  refiYear?: number;
  refiMonthCalendar?: number;
}

export interface FinancingValidationIssue {
  field: keyof PropertyFinancingPatch | 'general';
  message: string;
  severity: 'error' | 'warning';
}

export interface FinancingPreview {
  financingType: FinancingType;
  monthsUntilBalloon: number | null;
  balloonMonth: number | null;
  balloonBalanceEstimate: number | null;
  refiPaymentEstimate: number | null;
  aggregatePiAtBalloon: number | null;
  urgency: 'none' | 'info' | 'warning' | 'critical';
  urgencyLabel: string | null;
}

const DEFAULT_BALLOON_MONTHS = 60;
const DEFAULT_AMORT_MONTHS = 240;

export function resolveFinancingType(p: Property): FinancingType {
  if (p.financingType === 'seller' || p.financingType === 'conventional') {
    return p.financingType;
  }
  if (p.balloonMonths != null || p.sellerPayoffCap != null) return 'seller';
  return 'conventional';
}

export function monthsUntilBalloon(p: Property, asOfMonth: number): number | null {
  if (resolveFinancingType(p) !== 'seller' && p.balloonMonths == null) return null;
  const closeMonth = p.closeMonth ?? 1;
  const balloonMonths = p.balloonMonths ?? DEFAULT_BALLOON_MONTHS;
  const balloonMonth = p.refiSimMonth ?? closeMonth + balloonMonths;
  if (asOfMonth >= balloonMonth) return null;
  return balloonMonth - asOfMonth;
}

export function balloonMonthForProperty(p: Property): number | null {
  if (resolveFinancingType(p) !== 'seller' && p.balloonMonths == null) return null;
  const closeMonth = p.closeMonth ?? 1;
  const balloonMonths = p.balloonMonths ?? DEFAULT_BALLOON_MONTHS;
  return p.refiSimMonth ?? closeMonth + balloonMonths;
}

function paymentFromPrincipal(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

export function buildFinancingPreview(
  p: Property,
  portfolio: Portfolio,
  asOfMonth: number,
): FinancingPreview {
  const financingType = resolveFinancingType(p);
  const monthsLeft = monthsUntilBalloon(p, asOfMonth);
  const balloonMonth = balloonMonthForProperty(p);

  let balloonBalanceEstimate: number | null = null;
  let aggregatePiAtBalloon: number | null = null;
  let refiPaymentEstimate: number | null = null;

  if (financingType === 'seller') {
    const balloonMonths = p.balloonMonths ?? DEFAULT_BALLOON_MONTHS;
    const amortMonths = p.sellerAmortizationMonths ?? DEFAULT_AMORT_MONTHS;

    if (p.sellerPayoffCap != null && p.sellerPayoffCap > 0) {
      aggregatePiAtBalloon = p.monthlyPayment * balloonMonths;
      balloonBalanceEstimate = Math.max(0, p.sellerPayoffCap - aggregatePiAtBalloon);
    } else if (p.balance > 0) {
      try {
        const terms = computeSellerFinancingTerms(
          p.balance + p.monthlyPayment * balloonMonths,
          p.annualInterestRate,
          amortMonths,
          balloonMonths,
        );
        balloonBalanceEstimate = terms.balloonBalance;
        aggregatePiAtBalloon = p.monthlyPayment * balloonMonths;
      } catch {
        balloonBalanceEstimate = p.balance;
      }
    }

    const refiRate = p.balloonRefiAnnualRate ?? portfolio.defaultRefiAnnualRate ?? 0.065;
    const refiTerm = p.balloonRefiTermMonths ?? portfolio.defaultRefiTermMonths ?? 360;
    const refiPrincipal = balloonBalanceEstimate ?? p.balance;
    if (refiPrincipal > 0) {
      refiPaymentEstimate = paymentFromPrincipal(refiPrincipal, refiRate, refiTerm);
    }
  }

  let urgency: FinancingPreview['urgency'] = 'none';
  let urgencyLabel: string | null = null;

  if (monthsLeft != null) {
    if (monthsLeft <= 12) {
      urgency = 'critical';
      urgencyLabel = `Balloon in ${monthsLeft} mo`;
    } else if (monthsLeft <= 24) {
      urgency = 'warning';
      urgencyLabel = `Balloon in ${formatMonths(monthsLeft)}`;
    } else if (monthsLeft <= 60) {
      urgency = 'info';
      urgencyLabel = `Balloon in ${formatMonths(monthsLeft)}`;
    }
  }

  return {
    financingType,
    monthsUntilBalloon: monthsLeft,
    balloonMonth,
    balloonBalanceEstimate,
    refiPaymentEstimate,
    aggregatePiAtBalloon,
    urgency,
    urgencyLabel,
  };
}

export function validatePropertyFinancing(p: Property): FinancingValidationIssue[] {
  const issues: FinancingValidationIssue[] = [];
  const type = resolveFinancingType(p);

  if (type === 'seller') {
    const balloonMonths = p.balloonMonths ?? DEFAULT_BALLOON_MONTHS;
    const amortMonths = p.sellerAmortizationMonths ?? DEFAULT_AMORT_MONTHS;

    if (balloonMonths <= 0) {
      issues.push({
        field: 'balloonMonths',
        message: 'Balloon term must be at least 1 month',
        severity: 'error',
      });
    }
    if (amortMonths <= 0) {
      issues.push({
        field: 'sellerAmortizationMonths',
        message: 'Amortization term must be positive',
        severity: 'error',
      });
    }
    if (balloonMonths > amortMonths) {
      issues.push({
        field: 'balloonMonths',
        message: 'Balloon month exceeds amortization term — payment may not cover interest',
        severity: 'warning',
      });
    }
    if (p.sellerPayoffCap != null && p.sellerPayoffCap <= 0) {
      issues.push({
        field: 'sellerPayoffCap',
        message: 'Payoff cap must be positive',
        severity: 'error',
      });
    }
    if (p.sellerPayoffCap != null && p.monthlyPayment > 0) {
      const aggregate = p.monthlyPayment * balloonMonths;
      if (aggregate >= p.sellerPayoffCap) {
        issues.push({
          field: 'sellerPayoffCap',
          message: `P&I through balloon (${formatCurrency(aggregate)}) exceeds payoff cap`,
          severity: 'error',
        });
      }
    }
    const monthlyInterest = p.balance * (p.annualInterestRate / 12);
    if (p.balance > 0 && p.monthlyPayment < monthlyInterest - 1e-6) {
      issues.push({
        field: 'monthlyPayment',
        message: 'Payment below interest-only — balance will grow',
        severity: 'warning',
      });
    }
    const refiTerm = p.balloonRefiTermMonths ?? 360;
    if (refiTerm <= 0) {
      issues.push({
        field: 'balloonRefiTermMonths',
        message: 'Post-balloon refi term must be positive',
        severity: 'error',
      });
    }
  }

  return issues;
}

export function applyFinancingPatch(p: Property, patch: PropertyFinancingPatch): Property {
  const next: Property = { ...p, ...patch };
  if (patch.financingType === 'conventional') {
    next.balloonMonths = undefined;
    next.sellerAmortizationMonths = undefined;
    next.sellerPayoffCap = undefined;
    next.balloonRefiAnnualRate = undefined;
    next.balloonRefiTermMonths = undefined;
    next.sellerCredit = undefined;
    next.refiYear = undefined;
    next.refiMonthCalendar = undefined;
    next.refiSimMonth = undefined;
  }
  if (patch.financingType === 'seller' && next.balloonMonths == null) {
    next.balloonMonths = DEFAULT_BALLOON_MONTHS;
  }
  if (patch.financingType === 'seller' && next.sellerAmortizationMonths == null) {
    next.sellerAmortizationMonths = DEFAULT_AMORT_MONTHS;
  }
  return next;
}

export function deriveTermsFromPayoffCap(
  p: Property,
): { balance: number; monthlyPayment: number; balloonBalance: number } | null {
  const cap = p.sellerPayoffCap;
  if (cap == null || cap <= 0) return null;
  const balloonMonths = p.balloonMonths ?? DEFAULT_BALLOON_MONTHS;
  const amortMonths = p.sellerAmortizationMonths ?? DEFAULT_AMORT_MONTHS;
  try {
    const terms = computeSellerFinancingTerms(
      cap,
      p.annualInterestRate,
      amortMonths,
      balloonMonths,
    );
    return {
      balance: terms.principal,
      monthlyPayment: terms.monthlyPayment,
      balloonBalance: terms.balloonBalance,
    };
  } catch {
    return null;
  }
}

export function financingBadgeLabel(p: Property, asOfMonth: number): string {
  const type = resolveFinancingType(p);
  if (type === 'conventional') return 'Conv';
  const months = monthsUntilBalloon(p, asOfMonth);
  if (months == null) return 'Seller';
  if (months <= 12) return `Seller · ${months}mo`;
  if (months <= 60) return `Seller · ${Math.round(months / 12)}yr`;
  return 'Seller';
}
