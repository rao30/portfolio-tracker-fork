export interface ExpenseBreakdown {
  propertyTax?: number;
  insurance?: number;
  hoa?: number;
  management?: number;
  /** Management fee as fraction of gross rent (overrides flat management if set). */
  managementPercent?: number;
  maintenance?: number;
  utilities?: number;
  other?: number;
}

export type PropertyEventType =
  | 'rentChange'
  | 'rateReset'
  | 'capexSpike'
  | 'refinance'
  | 'acquisition'
  | 'disposition';

export interface PropertyEvent {
  month: number;
  type: PropertyEventType;
  /** New monthly rent (rentChange). */
  rent?: number;
  /** New annual interest rate (rateReset, refinance). */
  rate?: number;
  /** New monthly P&I (refinance). */
  payment?: number;
  /** New loan balance (refinance). */
  balance?: number;
  /** One-time capex cash outflow (capexSpike). */
  amount?: number;
  /** Property snapshot for acquisition events. */
  property?: Omit<Property, 'events'>;
}

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
  /** Override portfolio default vacancy rate. */
  vacancyRate?: number;
  /** Override portfolio default capex reserve rate (% of gross rent). */
  capexReserveRate?: number;
  capexReserveFlat?: number;
  /** Down payment + closing + rehab; defaults to marketValue - balance. */
  cashInvested?: number;
  originalLoanAmount?: number;
  remainingTermMonths?: number;
  /** Tax / depreciation inputs. */
  purchasePrice?: number;
  landPercent?: number;
  placedInServiceYear?: number;
  useCostSeg?: boolean;
  costSegPercent?: number;
  bonusEligiblePercent?: number;
  expenseBreakdown?: ExpenseBreakdown;
  events?: PropertyEvent[];
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
  monthlyCapex: number;
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
  finalEquity: number;
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
  vacancy_rate?: number;
  capex_reserve_rate?: number;
  capex_reserve_flat?: number;
  cash_invested?: number;
  original_loan_amount?: number;
  remaining_term_months?: number;
  purchase_price?: number;
  land_percent?: number;
  placed_in_service_year?: number;
  use_cost_seg?: boolean;
  cost_seg_percent?: number;
  bonus_eligible_percent?: number;
  expense_breakdown?: ExpenseBreakdownFile;
  events?: PropertyEvent[];
}

export interface ExpenseBreakdownFile {
  property_tax?: number;
  insurance?: number;
  hoa?: number;
  management?: number;
  management_percent?: number;
  maintenance?: number;
  utilities?: number;
  other?: number;
}

export interface TaxProfile {
  annualW2Income: number;
  spouseIsReps: boolean;
  marginalTaxRate: number;
  taxYear: number;
  bonusDepreciationRate: number;
  filingStatus?: 'mfj' | 'single';
  otherPassiveIncome?: number;
  stateTaxRate?: number;
}

export interface TaxProfileFile {
  annual_w2_income?: number;
  spouse_is_reps?: boolean;
  marginal_tax_rate?: number;
  tax_year?: number;
  bonus_depreciation_rate?: number;
  filing_status?: 'mfj' | 'single';
  other_passive_income?: number;
  state_tax_rate?: number;
}

export interface AcquisitionTemplate {
  label: string;
  purchasePrice: number;
  downPaymentPercent: number;
  annualInterestRate: number;
  loanTermMonths: number;
  monthlyRent: number;
  monthlyExpenses: number;
  landPercent: number;
  costSegPercent: number;
  useCostSeg: boolean;
}

export interface AcquisitionTemplateFile {
  label?: string;
  purchase_price?: number;
  down_payment_percent?: number;
  annual_interest_rate?: number;
  loan_term_months?: number;
  monthly_rent?: number;
  monthly_expenses?: number;
  land_percent?: number;
  cost_seg_percent?: number;
  use_cost_seg?: boolean;
}

export interface PortfolioFile {
  extra_monthly_budget: number;
  annual_rent_growth_rate?: number;
  annual_expense_inflation_rate?: number;
  reinvest_surplus?: boolean;
  monthly_reserve_target?: number;
  default_vacancy_rate?: number;
  default_capex_reserve_rate?: number;
  default_capex_reserve_flat?: number;
  tax_profile?: TaxProfileFile;
  acquisition_template?: AcquisitionTemplateFile;
  goals?: GoalConfig[];
  properties: PropertyFile[];
}

export interface Portfolio {
  extraMonthlyBudget: number;
  annualRentGrowthRate: number;
  annualExpenseInflationRate: number;
  reinvestSurplus: boolean;
  monthlyReserveTarget: number;
  defaultVacancyRate: number;
  defaultCapexReserveRate: number;
  defaultCapexReserveFlat: number;
  taxProfile: TaxProfile;
  acquisitionTemplate: AcquisitionTemplate;
  goals: GoalConfig[];
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
  sellProperty?: string;
  sellClosingCostRate?: number;
  /** Month at which to sell (default 1). */
  sellAtMonth?: number;
  /** Fraction of sale proceeds reinvested as lump-sum principal (rest to cash reserve). */
  sellProceedsToDebt?: number;
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
  dscr: number;
  cashOnCash: number;
  breakEvenOccupancy: number;
  interestToIncomeRatio: number;
  monthlyCapexReserve: number;
  warnings: string[];
}

export interface GoalConfig {
  type: 'debtFreeByMonth' | 'equityAtMonth' | 'netWorthAtMonth';
  targetMonth: number;
  targetValue?: number;
}

export type { StrategyId } from './snowball';
