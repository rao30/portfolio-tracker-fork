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
}

export interface MonthSnapshot {
  month: number;
  totalBalance: number;
  totalInterestThisMonth: number;
  totalPrincipalThisMonth: number;
  totalExtraApplied: number;
  monthlyCashflow: number;
  targetProperty: string | null;
  paidOffThisMonth: string[];
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
}

export interface PortfolioFile {
  extra_monthly_budget: number;
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
