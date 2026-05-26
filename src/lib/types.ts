export interface Property {
  name: string;
  balance: number;
  marketValue: number;
  annualInterestRate: number;
  annualAppreciationRate: number;
  monthlyPayment: number;
  monthlyRent: number;
  monthlyExpenses: number;
  /** Override portfolio default rent growth for this property. */
  annualRentGrowthRate?: number;
  /** Override portfolio default expense inflation for this property. */
  annualExpenseInflationRate?: number;
  /** `conventional` | `seller` — from portfolio JSON. */
  financingType?: 'conventional' | 'seller';
  /** Simulation month when the loan begins (derived or explicit in JSON). */
  closeMonth?: number;
  /** Calendar close year (portfolio JSON). */
  closeYear?: number;
  /** Calendar close month 1–12 (portfolio JSON, default 1). */
  closeMonthCalendar?: number;
  /** Seller loan: months of 0% amortizing payments before refi. */
  balloonMonths?: number;
  /** Seller loan: amortization term for scheduled payment (e.g. 240). */
  sellerAmortizationMonths?: number;
  /** Calendar year of balloon refi (portfolio JSON). */
  refiYear?: number;
  /** Calendar month of balloon refi 1–12 (portfolio JSON, default 1). */
  refiMonthCalendar?: number;
  /** Simulation month when refi occurs (derived from dates in JSON). */
  refiSimMonth?: number;
  /** Post-balloon refi rate (portfolio JSON). */
  balloonRefiAnnualRate?: number;
  /** Post-balloon refi term in months (portfolio JSON). */
  balloonRefiTermMonths?: number;
}

/** Fields required when adding a new property via the UI. */
export type PropertyDraft = Property;

export interface MonthSnapshot {
  month: number;
  totalBalance: number;
  totalInterestThisMonth: number;
  totalPrincipalThisMonth: number;
  totalExtraApplied: number;
  monthlyCashflow: number;
  targetProperty: string | null;
  paidOffThisMonth: string[];
  /** Properties refinanced into a conventional loan after seller balloon (month 60). */
  refinancedThisMonth: string[];
  balancesByName: Record<string, number>;
  valuesByName: Record<string, number>;
  equityByName: Record<string, number>;
  totalEquity: number;
  totalPropertyValue: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyRent: number;
  monthlyExpenses: number;
  monthlyPi: number;
  cumulativeRentCollected: number;
  cumulativeExpenses: number;
  cashReserveBalance: number;
  cumulativeCashflowGenerated: number;
}

export interface SimulationResult {
  strategy: string;
  order: string[];
  monthsToPayoff: number;
  totalInterestPaid: number;
  totalExtraPaid: number;
  finalMonthlyCashflow: number;
  payoffSchedule: Record<string, number>;
  /** Month when each seller loan was refinanced after balloon (if applicable). */
  refinanceSchedule: Record<string, number>;
  history: MonthSnapshot[];
  /** Equity at debt-free month. */
  finalEquity: number;
  /** Net worth (equity + cash) at debt-free month. */
  finalNetWorth: number;
}

export interface PropertyFile {
  name: string;
  balance: number;
  market_value: number;
  annual_interest_rate: number;
  annual_appreciation_rate?: number;
  monthly_payment: number;
  monthly_rent: number;
  monthly_expenses: number;
  annual_rent_growth_rate?: number;
  annual_expense_inflation_rate?: number;
  /** Simulation month when loan starts (overrides close_year). */
  close_month?: number;
  close_year?: number;
  /** Calendar month of closing, 1–12 (default 1). */
  close_month_calendar?: number;
  financing_type?: 'conventional' | 'seller';
  balloon_months?: number;
  seller_amortization_months?: number;
  refi_year?: number;
  refi_month?: number;
  refi_annual_rate?: number;
  refi_term_months?: number;
}

export interface PortfolioFile {
  extra_monthly_budget: number;
  /** Calendar year for simulation month 1 (default 2026). */
  simulation_anchor_year?: number;
  /** Calendar month for simulation month 1, 1–12 (default 1). */
  simulation_anchor_month?: number;
  /** Default post-balloon refi rate when not set per property. */
  default_refi_annual_rate?: number;
  /** Default post-balloon refi term when not set per property. */
  default_refi_term_months?: number;
  annual_rent_growth_rate?: number;
  annual_expense_inflation_rate?: number;
  reinvest_surplus?: boolean;
  monthly_reserve_target?: number;
  properties: PropertyFile[];
}

export interface Portfolio {
  extraMonthlyBudget: number;
  annualRentGrowthRate: number;
  annualExpenseInflationRate: number;
  reinvestSurplus: boolean;
  monthlyReserveTarget: number;
  /** Calendar year represented by simulation month 1. */
  simulationAnchorYear: number;
  simulationAnchorMonth: number;
  defaultRefiAnnualRate: number;
  defaultRefiTermMonths: number;
  properties: Property[];
}

export interface ScenarioConfig {
  id: string;
  label: string;
  vacancyRate?: number;
  capexReserveRate?: number;
  capexReserveFlat?: number;
  rateShock?: number;
  pauseExtraMonths?: number;
  /** Property name to sell at simulation start (proceeds applied to target loan). */
  sellProperty?: string;
  /** Closing cost rate on sale (default 0.06). */
  sellClosingCostRate?: number;
}

export interface PropertyInsight {
  name: string;
  marketValue: number;
  balance: number;
  equity: number;
  ltv: number;
  capRate: number;
  payoffRank: number | null;
  monthlyNetRent: number;
}

export interface GoalConfig {
  type: 'debtFreeByMonth' | 'equityAtMonth' | 'netWorthAtMonth';
  targetMonth: number;
  targetValue?: number;
}

export type { StrategyId } from './snowball';
