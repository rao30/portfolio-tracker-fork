export const MOBILE_MISSION_MODULES = [
  'pulse',
  'assumptions',
  'balloon',
  'landscape',
  'stress',
  'timeline',
  'velocity',
  'snapshot',
  'playbook',
  'lab',
  'goals',
] as const;

export type MobileMissionModuleId = (typeof MOBILE_MISSION_MODULES)[number];

export interface MobileMissionControlPreferences {
  activeModule: MobileMissionModuleId;
  collapsedModules: MobileMissionModuleId[];
  showHeroStrip: boolean;
  updatedAt: string;
}

export interface MobileMissionModuleMeta {
  id: MobileMissionModuleId;
  label: string;
  shortLabel: string;
  description: string;
}

export const MOBILE_MISSION_MODULE_META: MobileMissionModuleMeta[] = [
  {
    id: 'pulse',
    label: 'Debt-Free Plan',
    shortLabel: 'Plan',
    description: 'Your payoff date plus a safe budget what-if slider',
  },
  {
    id: 'assumptions',
    label: 'Plan Settings',
    shortLabel: 'Settings',
    description: 'Rent growth, inflation, reserves, and snowball settings',
  },
  {
    id: 'balloon',
    label: 'Balloon Payment Risk',
    shortLabel: 'Balloon',
    description: 'Will each loan be paid off before its balloon comes due?',
  },
  {
    id: 'landscape',
    label: 'Budget & Strategy Explorer',
    shortLabel: 'Explorer',
    description: 'Compare every budget and strategy combination at a glance',
  },
  {
    id: 'stress',
    label: 'Stress Test',
    shortLabel: 'Stress',
    description: 'See how a bad year would affect your plan',
  },
  {
    id: 'timeline',
    label: 'Future Events Planner',
    shortLabel: 'Events',
    description: 'Model rent changes, refis, and big expenses ahead of time',
  },
  {
    id: 'velocity',
    label: 'Equity Buildup Speed',
    shortLabel: 'Equity',
    description: 'How fast loan paydown turns into equity you own',
  },
  {
    id: 'snapshot',
    label: 'Portfolio Snapshot',
    shortLabel: 'Snapshot',
    description: 'Year-by-year portfolio metrics',
  },
  {
    id: 'playbook',
    label: 'Custom Payoff Order',
    shortLabel: 'Order',
    description: 'Pick exactly which property to pay off next',
  },
  {
    id: 'lab',
    label: 'Saved Scenarios',
    shortLabel: 'Saved',
    description: 'Pin and compare plans side by side',
  },
  {
    id: 'goals',
    label: 'Debt-Free Goal',
    shortLabel: 'Goal',
    description: 'Set a target date and track progress toward it',
  },
];
