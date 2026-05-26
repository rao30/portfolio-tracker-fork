/**
 * Server-side entry for esbuild bundle (simulation + tax engine).
 */
export {
  STRATEGY_LABELS,
  SCENARIO_PRESETS,
  compareStrategies,
  runSimulation,
  generateInsights,
  computePortfolioYearMetrics,
  computePropertyInsightsAtMonth,
  computePropertyInsights,
  currentPortfolioMetrics,
  comparisonAtHorizons,
  findBudgetForDebtFreeByMonth,
  findBudgetForEquityAtMonth,
  monthForPortfolioYear,
  maxPortfolioDashboardYear,
  snapshotAtMonth,
  normalizePortfolio,
  buildSellScenario,
} from '../src/lib/snowball.ts';

export { computeTaxPlannerResult } from '../src/lib/tax.ts';

export type { StrategyId } from '../src/lib/snowball.ts';
