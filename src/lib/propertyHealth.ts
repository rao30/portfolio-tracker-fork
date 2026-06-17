import type { Portfolio, Property } from './types';
import {
  resolveMonthlyExpenses,
  resolveMonthlyUtilities,
  totalMonthlyExpenses,
  validateProperty,
  type PropertyValidation,
} from './snowball';
import { resolveFinancingType } from './propertyFinancing';

export type HealthSeverity = 'ok' | 'warning' | 'critical';

export interface PropertyHealthIssue {
  field?: keyof Property | 'financing';
  message: string;
  severity: HealthSeverity;
}

export interface PropertyHealthMetrics {
  dscr: number;
  ltv: number;
  equity: number;
  monthlyCashflow: number;
  monthlyNoi: number;
}

export interface PropertyHealth {
  score: number;
  severity: HealthSeverity;
  issues: PropertyHealthIssue[];
  metrics: PropertyHealthMetrics;
}

function severityFromScore(score: number): HealthSeverity {
  if (score >= 80) return 'ok';
  if (score >= 50) return 'warning';
  return 'critical';
}

/** Live health snapshot for a single property at edit time. */
export function buildPropertyHealth(
  property: Property,
  portfolio: Portfolio,
): PropertyHealth {
  const validation: PropertyValidation = validateProperty(property, portfolio);
  const issues: PropertyHealthIssue[] = validation.warnings.map((message) => ({
    message,
    severity: message.includes('DSCR below') || message.includes('does not cover')
      ? 'critical'
      : 'warning',
  }));

  const vacancy = property.vacancyRate ?? portfolio.defaultVacancyRate ?? 0;
  const effectiveRent = property.monthlyRent * (1 - vacancy);
  const operating = resolveMonthlyExpenses(property);
  const utilities = resolveMonthlyUtilities(property);
  const totalExp = totalMonthlyExpenses(property.monthlyRent, operating, utilities);
  const capexRate = property.capexReserveRate ?? portfolio.defaultCapexReserveRate ?? 0;
  const capexFlat = property.capexReserveFlat ?? portfolio.defaultCapexReserveFlat ?? 0;
  const capex =
    property.monthlyRent * capexRate + (capexFlat > 0 ? capexFlat : 0);
  const debtService = property.balance > 0 ? property.monthlyPayment : 0;
  const monthlyNoi = effectiveRent - totalExp;
  const monthlyCashflow = monthlyNoi - debtService - capex;
  const noiAnnual = monthlyNoi * 12;
  const debtServiceAnnual = property.monthlyPayment * 12;
  const dscr =
    debtServiceAnnual > 0 && property.balance > 0
      ? noiAnnual / debtServiceAnnual
      : Infinity;
  const ltv =
    property.marketValue > 0 ? property.balance / property.marketValue : 0;
  const equity = Math.max(0, property.marketValue - property.balance);

  if (property.balance > 0 && property.monthlyPayment <= 0) {
    issues.push({
      field: 'monthlyPayment',
      message: 'Loan balance without a monthly payment',
      severity: 'critical',
    });
  }

  if (property.marketValue <= 0 && property.balance > 0) {
    issues.push({
      field: 'marketValue',
      message: 'Market value missing for leveraged property',
      severity: 'warning',
    });
  }

  if (resolveFinancingType(property) === 'seller' && !property.balloonMonths) {
    issues.push({
      field: 'financing',
      message: 'Seller note missing balloon term',
      severity: 'warning',
    });
  }

  let score = 100;
  for (const issue of issues) {
    score -= issue.severity === 'critical' ? 25 : 12;
  }
  if (dscr < 1.25 && Number.isFinite(dscr) && property.balance > 0) {
    score -= dscr < 1 ? 15 : 8;
  }
  if (ltv > 0.9) score -= 10;
  if (monthlyCashflow < 0) score -= 8;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    severity: severityFromScore(score),
    issues,
    metrics: {
      dscr,
      ltv,
      equity,
      monthlyCashflow,
      monthlyNoi,
    },
  };
}

export function healthSeverityClass(severity: HealthSeverity): string {
  if (severity === 'ok') return 'bg-emerald-500';
  if (severity === 'warning') return 'bg-amber-500';
  return 'bg-red-500';
}

export function healthBorderClass(severity: HealthSeverity): string {
  if (severity === 'ok') return 'border-emerald-500/30';
  if (severity === 'warning') return 'border-amber-500/40';
  return 'border-red-500/40';
}
