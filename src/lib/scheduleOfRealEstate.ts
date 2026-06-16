import type { Portfolio, Property, ScenarioConfig, SimulationResult } from './types';
import { formatMonths } from './format';
import {
  computePropertyInsightsAtMonth,
  isPropertyActiveAtMonth,
  propertyGrownRentAtMonth,
  propertyGrownOperatingAtMonth,
  resolveCashInvested,
  resolveMonthlyUtilities,
} from './snowball';

/** One row on a personal financial statement schedule of real estate. */
export interface ScheduleRow {
  propertyDescription: string;
  propertyType: string;
  ownershipPercent: number;
  dateAcquired: string;
  purchasePrice: number;
  marketValue: number;
  loanBalance: number;
  interestRate: number;
  monthlyPi: number;
  remainingTerm: string;
  financingType: string;
  grossAnnualRent: number;
  annualOperatingExpenses: number;
  netOperatingIncome: number;
  annualDebtService: number;
  cashFlowAfterDebt: number;
  equity: number;
  ltv: number;
  cashInvested: number;
  notes: string;
}

export interface ScheduleTotals {
  purchasePrice: number;
  marketValue: number;
  loanBalance: number;
  grossAnnualRent: number;
  annualOperatingExpenses: number;
  netOperatingIncome: number;
  annualDebtService: number;
  cashFlowAfterDebt: number;
  equity: number;
  ltv: number;
  cashInvested: number;
}

export interface ScheduleOfRealEstate {
  title: string;
  asOfDate: string;
  asOfLabel: string;
  calendarYear: number;
  simulationMonth: number;
  propertyCount: number;
  rows: ScheduleRow[];
  totals: ScheduleTotals;
}

export const SCHEDULE_PREVIEW_COLUMNS: {
  key: keyof ScheduleRow;
  label: string;
  format: 'text' | 'currency' | 'percent' | 'rate';
}[] = [
  { key: 'propertyDescription', label: 'Property', format: 'text' },
  { key: 'propertyType', label: 'Type', format: 'text' },
  { key: 'dateAcquired', label: 'Acquired', format: 'text' },
  { key: 'purchasePrice', label: 'Purchase', format: 'currency' },
  { key: 'marketValue', label: 'Market value', format: 'currency' },
  { key: 'loanBalance', label: 'Loan balance', format: 'currency' },
  { key: 'interestRate', label: 'Rate', format: 'rate' },
  { key: 'monthlyPi', label: 'P&I', format: 'currency' },
  { key: 'grossAnnualRent', label: 'Gross rent', format: 'currency' },
  { key: 'netOperatingIncome', label: 'NOI', format: 'currency' },
  { key: 'cashFlowAfterDebt', label: 'Cash flow', format: 'currency' },
  { key: 'equity', label: 'Equity', format: 'currency' },
  { key: 'ltv', label: 'LTV', format: 'percent' },
];

export const SCHEDULE_EXCEL_COLUMNS: {
  key: keyof ScheduleRow | 'lineNumber';
  label: string;
  width: number;
  format: 'text' | 'currency' | 'percent' | 'rate';
}[] = [
  { key: 'lineNumber', label: '#', width: 5, format: 'text' },
  { key: 'propertyDescription', label: 'Property description', width: 38, format: 'text' },
  { key: 'propertyType', label: 'Property type', width: 16, format: 'text' },
  { key: 'ownershipPercent', label: 'Ownership %', width: 12, format: 'percent' },
  { key: 'dateAcquired', label: 'Date acquired', width: 14, format: 'text' },
  { key: 'purchasePrice', label: 'Original cost / purchase price', width: 18, format: 'currency' },
  { key: 'marketValue', label: 'Current market value', width: 18, format: 'currency' },
  { key: 'financingType', label: 'Financing', width: 18, format: 'text' },
  { key: 'loanBalance', label: 'Mortgage balance', width: 16, format: 'currency' },
  { key: 'interestRate', label: 'Interest rate', width: 12, format: 'rate' },
  { key: 'monthlyPi', label: 'Monthly P&I', width: 14, format: 'currency' },
  { key: 'remainingTerm', label: 'Remaining term', width: 16, format: 'text' },
  { key: 'grossAnnualRent', label: 'Gross annual rental income', width: 18, format: 'currency' },
  {
    key: 'annualOperatingExpenses',
    label: 'Annual operating expenses',
    width: 18,
    format: 'currency',
  },
  { key: 'netOperatingIncome', label: 'Net operating income (NOI)', width: 18, format: 'currency' },
  { key: 'annualDebtService', label: 'Annual debt service', width: 16, format: 'currency' },
  {
    key: 'cashFlowAfterDebt',
    label: 'Cash flow after debt service',
    width: 18,
    format: 'currency',
  },
  { key: 'equity', label: 'Estimated equity', width: 16, format: 'currency' },
  { key: 'ltv', label: 'LTV', width: 10, format: 'percent' },
  { key: 'cashInvested', label: 'Cash invested', width: 14, format: 'currency' },
  { key: 'notes', label: 'Notes', width: 24, format: 'text' },
];

function inferPropertyType(name: string): string {
  if (/deborah|shadybrook|larchbrook|summit|idlecreek/i.test(name)) return 'Duplex';
  if (/primary|house hack|additional rental/i.test(name)) return 'SFR (house hack)';
  return 'SFR';
}

function formatDateAcquired(p: Property): string {
  if (p.closeYear != null) {
    const month = p.closeMonthCalendar ?? 1;
    const date = new Date(p.closeYear, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  if (p.placedInServiceYear != null) return String(p.placedInServiceYear);
  return 'Prior to report';
}

function formatFinancingType(p: Property): string {
  if (p.financingType === 'seller') {
    const balloon = p.balloonMonths ? `${p.balloonMonths}-mo balloon` : 'seller note';
    return `Seller financing (${balloon})`;
  }
  return 'Conventional mortgage';
}

function formatRemainingTerm(p: Property): string {
  if (p.remainingTermMonths != null && p.remainingTermMonths > 0) {
    return formatMonths(p.remainingTermMonths);
  }
  if (p.financingType === 'seller' && p.balloonMonths != null) {
    return `${p.balloonMonths} mo balloon`;
  }
  return '—';
}

function buildNotes(p: Property, ownerOccupied: boolean): string {
  const parts: string[] = [];
  if (ownerOccupied) parts.push('Owner-occupied / house hack');
  if (p.financingType === 'seller' && p.refiYear != null) {
    parts.push(`Refi projected ${p.refiYear}`);
  }
  if (/projected/i.test(p.name)) parts.push('Projected');
  return parts.join('; ');
}

function sumRows(rows: ScheduleRow[], key: keyof ScheduleTotals): number {
  return rows.reduce((sum, row) => sum + (row[key as keyof ScheduleRow] as number), 0);
}

export function buildScheduleOfRealEstate(
  portfolio: Portfolio,
  result: SimulationResult,
  asOfMonth: number,
  scenario?: ScenarioConfig | null,
): ScheduleOfRealEstate {
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const calendarYear = anchorYear + Math.floor((asOfMonth - 1) / 12);
  const monthInCalendarYear = ((asOfMonth - 1) % 12) + 1;
  const asOfDate = new Date(calendarYear, monthInCalendarYear - 1, 1);
  const asOfLabel = asOfDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const insights = computePropertyInsightsAtMonth(
    portfolio,
    result,
    asOfMonth,
    scenario,
  );
  const insightByName = new Map(insights.map((i) => [i.name, i]));

  const rows: ScheduleRow[] = portfolio.properties
    .filter((p) => isPropertyActiveAtMonth(p, asOfMonth))
    .map((p) => {
      const insight = insightByName.get(p.name);
      const grossRentMonthly = propertyGrownRentAtMonth(p, portfolio, asOfMonth);
      const operatingMonthly = propertyGrownOperatingAtMonth(p, portfolio, asOfMonth);
      const utilitiesMonthly = resolveMonthlyUtilities(p);
      const grossAnnualRent = grossRentMonthly * 12;
      const annualOperatingExpenses = (operatingMonthly + utilitiesMonthly) * 12;
      const marketValue = insight?.marketValue ?? p.marketValue;
      const loanBalance = insight?.balance ?? p.balance;
      const equity = insight?.equity ?? marketValue - loanBalance;
      const ltv = insight?.ltv ?? (marketValue > 0 ? loanBalance / marketValue : 0);
      const noi = insight ? insight.monthlyNetRent * 12 : 0;
      const monthlyPayment =
        loanBalance > 0 && insight
          ? insight.monthlyNetRent - insight.monthlyCapexReserve - insight.cashflowMonthly
          : 0;
      const annualDebtService = monthlyPayment * 12;
      const ownerOccupied = insight?.excludedFromRentalCashflow ?? false;

      return {
        propertyDescription: p.name,
        propertyType: inferPropertyType(p.name),
        ownershipPercent: 1,
        dateAcquired: formatDateAcquired(p),
        purchasePrice: p.purchasePrice ?? p.marketValue,
        marketValue,
        loanBalance,
        interestRate: p.annualInterestRate,
        monthlyPi: monthlyPayment,
        remainingTerm: formatRemainingTerm(p),
        financingType: formatFinancingType(p),
        grossAnnualRent,
        annualOperatingExpenses,
        netOperatingIncome: noi,
        annualDebtService,
        cashFlowAfterDebt: insight?.cashflowAnnual ?? 0,
        equity,
        ltv,
        cashInvested: resolveCashInvested(p),
        notes: buildNotes(p, ownerOccupied),
      };
    });

  const totalMarketValue = sumRows(rows, 'marketValue');
  const totalLoanBalance = sumRows(rows, 'loanBalance');

  const totals: ScheduleTotals = {
    purchasePrice: sumRows(rows, 'purchasePrice'),
    marketValue: totalMarketValue,
    loanBalance: totalLoanBalance,
    grossAnnualRent: sumRows(rows, 'grossAnnualRent'),
    annualOperatingExpenses: sumRows(rows, 'annualOperatingExpenses'),
    netOperatingIncome: sumRows(rows, 'netOperatingIncome'),
    annualDebtService: sumRows(rows, 'annualDebtService'),
    cashFlowAfterDebt: sumRows(rows, 'cashFlowAfterDebt'),
    equity: sumRows(rows, 'equity'),
    ltv: totalMarketValue > 0 ? totalLoanBalance / totalMarketValue : 0,
    cashInvested: sumRows(rows, 'cashInvested'),
  };

  return {
    title: 'Schedule of Real Estate',
    asOfDate: asOfDate.toISOString().slice(0, 10),
    asOfLabel,
    calendarYear,
    simulationMonth: asOfMonth,
    propertyCount: rows.length,
    rows,
    totals,
  };
}
