export type DashboardSection =
  | 'command'
  | 'strategy'
  | 'portfolio'
  | 'charts'
  | 'tax'
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
    id: 'command',
    label: 'Command Center',
    shortLabel: 'Command',
    description: 'Decision pulse, balloon safety, payoff landscape',
  },
  {
    id: 'strategy',
    label: 'Strategy & Planning',
    shortLabel: 'Strategy',
    description: 'Budget, playbook, stress lab, timeline, lab',
  },
  {
    id: 'portfolio',
    label: 'Portfolio Snapshot',
    shortLabel: 'Snapshot',
    description: 'Metrics, insights, and horizon views',
  },
  {
    id: 'charts',
    label: 'Charts',
    shortLabel: 'Charts',
    description: 'Visualize wealth, cashflow, and payoff paths',
  },
  {
    id: 'tax',
    label: 'Tax & Goals',
    shortLabel: 'Tax',
    description: 'Tax Shield command center, freedom date goals, and milestones',
  },
  {
    id: 'properties',
    label: 'Properties',
    shortLabel: 'Properties',
    description: 'Edit portfolio and per-property details',
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
