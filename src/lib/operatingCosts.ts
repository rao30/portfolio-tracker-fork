import type { ExpenseBreakdown, Portfolio, Property } from './types';
import {
  resolveMonthlyExpenses,
  resolveMonthlyUtilities,
  totalMonthlyExpenses,
} from './snowball';
import type {
  ExpenseLineKey,
  ExpenseLineMeta,
  ExpensePresetId,
  OperatingCostsAnalysis,
  OperatingCostsDelta,
  OperatingCostsMetrics,
  ResolvedExpenseLine,
} from './operatingCostsTypes';

export const EXPENSE_LINE_META: ExpenseLineMeta[] = [
  {
    key: 'propertyTax',
    label: 'Property tax',
    scheduleELine: '16',
    scheduleELabel: 'Taxes',
    hint: 'Monthly accrual; annual ÷ 12',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    scheduleELine: '9',
    scheduleELabel: 'Insurance',
    hint: 'Landlord hazard / liability',
  },
  {
    key: 'hoa',
    label: 'HOA / condo',
    scheduleELine: '19',
    scheduleELabel: 'Other',
    hint: 'Association dues',
  },
  {
    key: 'management',
    label: 'Management (flat)',
    scheduleELine: '11',
    scheduleELabel: 'Management fees',
    hint: 'Flat fee; overridden by % below',
  },
  {
    key: 'managementPercent',
    label: 'Management %',
    scheduleELine: '11',
    scheduleELabel: 'Management fees',
    allowPercent: true,
    hint: 'Fraction of gross rent',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    scheduleELine: '7',
    scheduleELabel: 'Cleaning & maintenance',
    hint: 'Repairs, turnover, capex reserve proxy',
  },
  {
    key: 'utilities',
    label: 'Utilities',
    scheduleELine: '17',
    scheduleELabel: 'Utilities',
    hint: 'Landlord-paid when not itemized separately',
  },
  {
    key: 'other',
    label: 'Other',
    scheduleELine: '19',
    scheduleELabel: 'Other',
    hint: 'Landscaping, pest, misc',
  },
];

export const EXPENSE_PRESET_LABELS: Record<ExpensePresetId, string> = {
  lean_self_managed: 'Lean self-managed',
  typical: 'Typical landlord',
  agency_managed: 'Agency-managed',
  from_market_value: 'From market value',
};

export const EXPENSE_PRESET_HINTS: Record<ExpensePresetId, string> = {
  lean_self_managed: 'Low maintenance, no mgmt fee',
  typical: 'Balanced ratios for most SFRs',
  agency_managed: '10% mgmt + higher upkeep',
  from_market_value: 'Tax & insurance from value/rates',
};

function vacancyRate(property: Property, portfolio: Portfolio): number {
  return property.vacancyRate ?? portfolio.defaultVacancyRate ?? 0;
}

function capexMonthly(property: Property, portfolio: Portfolio): number {
  const capexRate = property.capexReserveRate ?? portfolio.defaultCapexReserveRate ?? 0;
  const capexFlat = property.capexReserveFlat ?? portfolio.defaultCapexReserveFlat ?? 0;
  return property.monthlyRent * capexRate + (capexFlat > 0 ? capexFlat : 0);
}

function debtService(property: Property): number {
  return property.balance > 0 ? property.monthlyPayment : 0;
}

function propertyWithBreakdown(
  property: Property,
  breakdown?: ExpenseBreakdown,
): Property {
  if (!breakdown) return property;
  return { ...property, expenseBreakdown: breakdown };
}

function resolveLineAmount(
  property: Property,
  key: ExpenseLineKey,
  breakdown: ExpenseBreakdown,
): { amount: number; derived: boolean } {
  const basis = property.purchasePrice ?? property.marketValue;

  if (key === 'propertyTax') {
    if (breakdown.propertyTax != null) return { amount: breakdown.propertyTax, derived: false };
    if (property.propertyTaxRate != null && basis > 0) {
      return { amount: (basis * property.propertyTaxRate) / 12, derived: true };
    }
    return { amount: 0, derived: false };
  }

  if (key === 'insurance') {
    if (breakdown.insurance != null) return { amount: breakdown.insurance, derived: false };
    if (property.annualInsurance != null) {
      return { amount: property.annualInsurance / 12, derived: true };
    }
    return { amount: 0, derived: false };
  }

  if (key === 'managementPercent') {
    if (breakdown.managementPercent != null) {
      return { amount: property.monthlyRent * breakdown.managementPercent, derived: false };
    }
    return { amount: 0, derived: false };
  }

  if (key === 'management') {
    if (breakdown.managementPercent != null) return { amount: 0, derived: false };
    return { amount: breakdown.management ?? 0, derived: false };
  }

  if (key === 'utilities') {
    const utilitiesSeparate =
      property.utilityBreakdown != null ||
      property.monthlyUtilities != null ||
      property.utilitiesRentRate != null;
    if (utilitiesSeparate) return { amount: 0, derived: false };
    return { amount: breakdown.utilities ?? 0, derived: false };
  }

  const raw = breakdown[key];
  return { amount: raw ?? 0, derived: false };
}

export function buildResolvedExpenseLines(
  property: Property,
  breakdown?: ExpenseBreakdown,
): ResolvedExpenseLine[] {
  const b = breakdown ?? property.expenseBreakdown ?? {};
  const previewProperty = propertyWithBreakdown(property, b);
  const operating = resolveMonthlyExpenses(previewProperty);

  return EXPENSE_LINE_META.map((meta) => {
    const { amount, derived } = resolveLineAmount(property, meta.key, b);
    const annualAmount = amount * 12;
    return {
      key: meta.key,
      label: meta.label,
      scheduleELine: meta.scheduleELine,
      scheduleELabel: meta.scheduleELabel,
      monthlyAmount: amount,
      annualAmount,
      shareOfOperating: operating > 0 ? amount / operating : 0,
      isDerived: derived,
    };
  }).filter((line) => line.key !== 'management' || line.monthlyAmount > 0);
}

export function computeOperatingCostsMetrics(
  property: Property,
  portfolio: Portfolio,
  breakdown?: ExpenseBreakdown,
): OperatingCostsMetrics {
  const preview = propertyWithBreakdown(property, breakdown);
  const vacancy = vacancyRate(preview, portfolio);
  const effectiveRent = preview.monthlyRent * (1 - vacancy);
  const operating = resolveMonthlyExpenses(preview);
  const utilities = resolveMonthlyUtilities(preview);
  const totalExp = totalMonthlyExpenses(preview.monthlyRent, operating, utilities);
  const capex = capexMonthly(preview, portfolio);
  const monthlyNoi = effectiveRent - totalExp;
  const monthlyCashflow = monthlyNoi - debtService(preview) - capex;
  const noiAnnual = monthlyNoi * 12;
  const debtAnnual = preview.monthlyPayment * 12;
  const dscr =
    debtAnnual > 0 && preview.balance > 0 ? noiAnnual / debtAnnual : null;
  const grossRent = preview.monthlyRent;
  const operatingExpenseRatio =
    grossRent > 0 ? (operating + utilities) / grossRent : null;

  return {
    monthlyOperating: operating,
    monthlyUtilities: utilities,
    monthlyNoi,
    monthlyCashflow,
    dscr,
    operatingExpenseRatio,
  };
}

export function buildScheduleETotals(lines: ResolvedExpenseLine[]) {
  const byLine = new Map<string, { line: string; label: string; annual: number }>();
  for (const row of lines) {
    if (row.monthlyAmount <= 0) continue;
    const existing = byLine.get(row.scheduleELine);
    if (existing) {
      existing.annual += row.annualAmount;
    } else {
      byLine.set(row.scheduleELine, {
        line: row.scheduleELine,
        label: row.scheduleELabel,
        annual: row.annualAmount,
      });
    }
  }
  return [...byLine.values()].sort((a, b) => a.line.localeCompare(b.line));
}

export function validateExpenseBreakdown(
  breakdown: ExpenseBreakdown,
  property: Property,
): string[] {
  const issues: string[] = [];
  const numericKeys: ExpenseLineKey[] = [
    'propertyTax',
    'insurance',
    'hoa',
    'management',
    'maintenance',
    'utilities',
    'other',
  ];

  for (const key of numericKeys) {
    const val = breakdown[key];
    if (val != null && (val < 0 || !Number.isFinite(val))) {
      issues.push(`${key} must be a non-negative number`);
    }
  }

  if (breakdown.managementPercent != null) {
    if (breakdown.managementPercent < 0 || breakdown.managementPercent > 1) {
      issues.push('Management % must be between 0% and 100%');
    }
  }

  const preview = propertyWithBreakdown(property, breakdown);
  const operating = resolveMonthlyExpenses(preview);
  if (operating > property.monthlyRent * 1.5 && property.monthlyRent > 0) {
    issues.push('Operating costs exceed 150% of gross rent — double-check inputs');
  }

  return issues;
}

export function analyzeOperatingCosts(
  property: Property,
  portfolio: Portfolio,
  breakdown?: ExpenseBreakdown,
): OperatingCostsAnalysis {
  const b = breakdown ?? property.expenseBreakdown ?? {};
  const lines = buildResolvedExpenseLines(property, b);
  const metrics = computeOperatingCostsMetrics(property, portfolio, b);
  const issues = validateExpenseBreakdown(b, property);
  const hasBreakdown = Object.values(b).some((v) => v != null && v > 0);

  return {
    lines,
    scheduleETotals: buildScheduleETotals(lines),
    metrics,
    issues,
    hasBreakdown,
    lumpSumFallback: property.monthlyExpenses,
  };
}

export function computeOperatingCostsDelta(
  property: Property,
  portfolio: Portfolio,
  committed: ExpenseBreakdown | undefined,
  preview: ExpenseBreakdown,
): OperatingCostsDelta {
  const before = computeOperatingCostsMetrics(property, portfolio, committed);
  const after = computeOperatingCostsMetrics(property, portfolio, preview);

  return {
    monthlyOperatingDelta: after.monthlyOperating - before.monthlyOperating,
    monthlyNoiDelta: after.monthlyNoi - before.monthlyNoi,
    monthlyCashflowDelta: after.monthlyCashflow - before.monthlyCashflow,
    dscrDelta:
      before.dscr != null && after.dscr != null ? after.dscr - before.dscr : null,
  };
}

export function buildExpensePreset(
  preset: ExpensePresetId,
  property: Property,
  portfolio: Portfolio,
): ExpenseBreakdown {
  const rent = property.monthlyRent;
  const basis = property.purchasePrice ?? property.marketValue;

  if (preset === 'from_market_value') {
    const breakdown: ExpenseBreakdown = {};
    if (property.propertyTaxRate != null && basis > 0) {
      breakdown.propertyTax = (basis * property.propertyTaxRate) / 12;
    } else if (basis > 0) {
      breakdown.propertyTax = (basis * 0.012) / 12;
    }
    if (property.annualInsurance != null) {
      breakdown.insurance = property.annualInsurance / 12;
    } else if (basis > 0) {
      breakdown.insurance = (basis * 0.005) / 12;
    }
    if (rent > 0) {
      breakdown.maintenance = rent * 0.05;
      breakdown.other = rent * 0.02;
    }
    return breakdown;
  }

  if (preset === 'lean_self_managed') {
    return {
      propertyTax: rent > 0 ? rent * 0.08 : undefined,
      insurance: rent > 0 ? rent * 0.03 : undefined,
      maintenance: rent > 0 ? rent * 0.04 : undefined,
      other: rent > 0 ? rent * 0.01 : undefined,
    };
  }

  if (preset === 'agency_managed') {
    return {
      propertyTax: rent > 0 ? rent * 0.09 : undefined,
      insurance: rent > 0 ? rent * 0.035 : undefined,
      managementPercent: 0.1,
      maintenance: rent > 0 ? rent * 0.08 : undefined,
      hoa: rent > 0 ? rent * 0.02 : undefined,
      other: rent > 0 ? rent * 0.02 : undefined,
    };
  }

  // typical
  return {
    propertyTax: rent > 0 ? rent * 0.085 : undefined,
    insurance: rent > 0 ? rent * 0.032 : undefined,
    managementPercent: portfolio.properties.length > 3 ? 0.08 : undefined,
    management: portfolio.properties.length <= 3 && rent > 0 ? rent * 0.05 : undefined,
    maintenance: rent > 0 ? rent * 0.06 : undefined,
    hoa: rent > 0 ? rent * 0.015 : undefined,
    other: rent > 0 ? rent * 0.015 : undefined,
  };
}

export function breakdownsEqual(
  a: ExpenseBreakdown | undefined,
  b: ExpenseBreakdown | undefined,
): boolean {
  const keys: ExpenseLineKey[] = [
    'propertyTax',
    'insurance',
    'hoa',
    'management',
    'managementPercent',
    'maintenance',
    'utilities',
    'other',
  ];
  for (const key of keys) {
    const av = a?.[key];
    const bv = b?.[key];
    if (av == null && bv == null) continue;
    if (av == null || bv == null) return false;
    if (Math.abs(av - bv) > 1e-6) return false;
  }
  return true;
}

export function deltaToneClass(delta: number): string {
  if (delta > 0.5) return 'text-emerald-300';
  if (delta < -0.5) return 'text-red-300';
  return 'text-slate-400';
}

export function formatDeltaCurrency(delta: number): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}$${Math.round(delta).toLocaleString()}`;
}
