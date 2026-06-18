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
    label: 'Decision Pulse',
    shortLabel: 'Pulse',
    description: 'Safe-preview budget scrubber with payoff verdict',
  },
  {
    id: 'assumptions',
    label: 'Assumptions',
    shortLabel: 'Assume',
    description: 'Rent growth, inflation, reserves, and snowball settings',
  },
  {
    id: 'balloon',
    label: 'Balloon Safety',
    shortLabel: 'Balloon',
    description: 'Payoff deadline vs balloon maturity analysis',
  },
  {
    id: 'landscape',
    label: 'Payoff Landscape',
    shortLabel: 'Landscape',
    description: 'Budget × strategy heatmap explorer',
  },
  {
    id: 'stress',
    label: 'Stress Lab',
    shortLabel: 'Stress',
    description: 'What-if scenario stress testing',
  },
  {
    id: 'timeline',
    label: 'Timeline Studio',
    shortLabel: 'Timeline',
    description: 'Property lifecycle event planning',
  },
  {
    id: 'velocity',
    label: 'Principal Velocity',
    shortLabel: 'Velocity',
    description: 'Hidden income unlocked by snowball paydown',
  },
  {
    id: 'snapshot',
    label: 'Portfolio Snapshot',
    shortLabel: 'Snapshot',
    description: 'Year-by-year portfolio metrics',
  },
  {
    id: 'playbook',
    label: 'Payoff Playbook',
    shortLabel: 'Playbook',
    description: 'Custom payoff order with strategy base',
  },
  {
    id: 'lab',
    label: 'Strategy Lab',
    shortLabel: 'Lab',
    description: 'Pin and compare strategy scenarios',
  },
  {
    id: 'goals',
    label: 'Freedom Date',
    shortLabel: 'Goals',
    description: 'Calendar goals and milestone tracking',
  },
];
