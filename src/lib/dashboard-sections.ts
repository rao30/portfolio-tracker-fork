export type DashboardSection =
  | 'overview'
  | 'plan'
  | 'scenarios'
  | 'moves'
  | 'charts'
  | 'taxgoals'
  | 'properties';

export type MobileTab = 'overview' | 'charts' | 'portfolio' | 'settings';

export type ChartId =
  | 'net-worth'
  | 'wealth-composition'
  | 'income-expense'
  | 'monte-carlo'
  | 'strategy-comparison'
  | 'payoff-timeline'
  | 'balance'
  | 'interest'
  | 'cashflow';

export interface SectionConfig {
  id: DashboardSection;
  label: string;
  shortLabel: string;
  description: string;
}

export interface ChartConfig {
  id: ChartId;
  label: string;
  shortLabel: string;
}

export const DESKTOP_SECTIONS: SectionConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    description: 'See where you stand today and your recommended next move',
  },
  {
    id: 'plan',
    label: 'Payoff Plan',
    shortLabel: 'Plan',
    description: 'Set your extra budget and payoff strategy, then fine-tune the order',
  },
  {
    id: 'scenarios',
    label: 'Scenarios',
    shortLabel: 'Scenarios',
    description: 'Stress-test your plan and map out future rent, refi, and capex events',
  },
  {
    id: 'moves',
    label: 'Big Moves',
    shortLabel: 'Big Moves',
    description: 'Decide where to put extra cash, when to refinance, and whether to sell',
  },
  {
    id: 'charts',
    label: 'Charts',
    shortLabel: 'Charts',
    description: 'Visualize net worth, cashflow, and payoff paths over time',
  },
  {
    id: 'taxgoals',
    label: 'Tax & Goals',
    shortLabel: 'Tax & Goals',
    description: 'Estimate tax savings and track your debt-free target date',
  },
  {
    id: 'properties',
    label: 'Properties',
    shortLabel: 'Properties',
    description: 'Add and edit each property and its financing details',
  },
];

export const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'settings', label: 'Settings' },
];

export const CHART_CONFIGS: ChartConfig[] = [
  { id: 'net-worth', label: 'Net worth over time', shortLabel: 'Net worth' },
  { id: 'wealth-composition', label: 'Wealth composition', shortLabel: 'Wealth' },
  { id: 'income-expense', label: 'Income vs expenses', shortLabel: 'Income' },
  { id: 'monte-carlo', label: 'Equity uncertainty', shortLabel: 'Monte Carlo' },
  { id: 'strategy-comparison', label: 'Strategy comparison', shortLabel: 'Strategies' },
  { id: 'payoff-timeline', label: 'Payoff timeline', shortLabel: 'Payoff' },
  { id: 'balance', label: 'Loan balances', shortLabel: 'Balances' },
  { id: 'interest', label: 'Cumulative interest', shortLabel: 'Interest' },
  { id: 'cashflow', label: 'Monthly cashflow', shortLabel: 'Cashflow' },
];

/** Charts hidden on mobile (too wide / desktop-only analysis). */
export const MOBILE_HIDDEN_CHARTS: ChartId[] = ['monte-carlo'];

export function chartsForViewport(mobile: boolean): ChartConfig[] {
  if (!mobile) return CHART_CONFIGS;
  return CHART_CONFIGS.filter((c) => !MOBILE_HIDDEN_CHARTS.includes(c.id));
}
