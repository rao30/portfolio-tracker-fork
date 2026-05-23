export interface Property {
  name: string;
  balance: number;
  annualInterestRate: number;
  monthlyPayment: number;
  monthlyRent: number;
  monthlyExpenses: number;
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
}

export interface PropertyFile {
  name: string;
  balance: number;
  annual_interest_rate: number;
  monthly_payment: number;
  monthly_rent: number;
  monthly_expenses: number;
}

export interface PortfolioFile {
  extra_monthly_budget: number;
  properties: PropertyFile[];
}

export interface Portfolio {
  extraMonthlyBudget: number;
  properties: Property[];
}

export type { StrategyId } from './snowball';
