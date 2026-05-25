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
  /** Simulation month when the loan begins (default 1 = already owned). */
  closeMonth?: number;
  /** Calendar year of closing; converted using portfolio simulationAnchorYear. */
  closeYear?: number;
  /** Months after close when remaining balance is due in full (seller balloon). */
  balloonMonths?: number;
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
  /** Properties with a balloon payment due this month (after scheduled P&I). */
  balloonDueThisMonth: string[];
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
  /** Month when each balloon was fully satisfied (if applicable). */
  balloonPayoffSchedule: Record<string, number>;
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
  close_month?: number;
  close_year?: number;
  balloon_months?: number;
}

export interface PortfolioFile {
  extra_monthly_budget: number;
  /** Calendar year for simulation month 1 (default 2026). */
  simulation_anchor_year?: number;
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
