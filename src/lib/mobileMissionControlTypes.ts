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
    label: 'Payoff Plan',
    shortLabel: 'Plan',
    description: 'Your debt-free verdict and a budget what-if slider',
  },
  {
    id: 'assumptions',
    label: 'Assumptions',
    shortLabel: 'Assume',
    description: 'Rent growth, inflation, reserves, and snowball settings',
  },
  {
    id: 'balloon',
    label: 'Balloon Deadline Check',
    shortLabel: 'Balloon',
    description: 'Will your plan clear seller balloons in time?',
  },
  {
    id: 'landscape',
    label: 'Budget × Strategy Explorer',
    shortLabel: 'Explorer',
    description: 'Compare every budget and strategy at a glance',
  },
  {
    id: 'stress',
    label: 'Stress Test',
    shortLabel: 'Stress',
    description: 'See how bad times change your plan',
  },
  {
    id: 'timeline',
    label: 'Event Planner',
    shortLabel: 'Events',
    description: 'Schedule future rent, refi, capex, and sale events',
  },
  {
    id: 'velocity',
    label: 'Equity Buildup',
    shortLabel: 'Equity',
    description: 'The hidden equity you earn with every payment',
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
    description: 'Set exactly which loan to pay off first',
  },
  {
    id: 'lab',
    label: 'Saved Scenarios',
    shortLabel: 'Saved',
    description: 'Save and compare plans side by side',
  },
  {
    id: 'goals',
    label: 'Debt-Free Goal',
    shortLabel: 'Goal',
    description: 'Track your target debt-free date and milestones',
  },
];
