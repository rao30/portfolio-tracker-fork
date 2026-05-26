import { useEffect, useMemo, useState } from 'react';
import type { Portfolio, SimulationResult } from '../lib/types';
import {
  findBudgetForDebtFreeByMonth,
  findBudgetForEquityAtMonth,
  generateInsights,
  snapshotAtMonth,
  type StrategyId,
} from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import { NumericInput } from './NumericInput';

interface GoalTrackerProps {
  portfolio: Portfolio;
  active: SimulationResult;
  baseline: SimulationResult;
  strategyId: StrategyId;
  scenarioDelta?: {
    monthsDelta: number;
    equityDelta: number;
  } | null;
  onGoalsChange?: (goals: Portfolio['goals']) => void;
  /** insights = narrative only; goals = goal inputs; milestones = horizon grid; full = desktop */
  section?: 'full' | 'insights' | 'goals' | 'milestones';
  embedded?: boolean;
}

function sectionShell(embedded: boolean, section: string) {
  if (embedded) return '';
  if (section === 'full') return 'space-y-4';
  return 'app-surface p-4';
}

export function GoalTracker({
  portfolio,
  active,
  baseline,
  strategyId,
  scenarioDelta,
  onGoalsChange,
  section = 'full',
  embedded = false,
}: GoalTrackerProps) {
  const debtFreeGoal = portfolio.goals.find((g) => g.type === 'debtFreeByMonth');
  const equityGoal = portfolio.goals.find((g) => g.type === 'equityAtMonth');

  const [goalMonth, setGoalMonth] = useState(debtFreeGoal?.targetMonth ?? 180);
  const [goalEquity, setGoalEquity] = useState(equityGoal?.targetValue ?? 2_000_000);

  useEffect(() => {
    onGoalsChange?.([
      { type: 'debtFreeByMonth', targetMonth: goalMonth },
      { type: 'equityAtMonth', targetMonth: goalMonth, targetValue: goalEquity },
    ]);
  }, [goalMonth, goalEquity, onGoalsChange]);

  const insights = useMemo(
    () => generateInsights(portfolio, active, baseline, strategyId),
    [portfolio, active, baseline, strategyId],
  );

  const budgetForDebtFree = useMemo(
    () => findBudgetForDebtFreeByMonth(portfolio, strategyId, goalMonth),
    [portfolio, strategyId, goalMonth],
  );

  const budgetForEquity = useMemo(
    () =>
      findBudgetForEquityAtMonth(portfolio, strategyId, goalMonth, goalEquity),
    [portfolio, strategyId, goalMonth, goalEquity],
  );

  const year10Snap = snapshotAtMonth(active, 120);
  const debtFreeProgress = Math.min(
    100,
    (120 / Math.max(active.monthsToPayoff, 1)) * 100,
  );

  const showInsights = section === 'full' || section === 'insights';
  const showGoals = section === 'full' || section === 'goals';
  const showMilestones = section === 'full' || section === 'milestones';

  const insightsBlock = (
    <>
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Insights</h3>
      <ul className="space-y-2 text-sm text-slate-300">
        {insights.map((text) => (
          <li key={text} className="flex gap-2">
            <span className="shrink-0 text-cyan-400">•</span>
            <span>{text}</span>
          </li>
        ))}
        {scenarioDelta && (
          <li className="flex gap-2">
            <span className="shrink-0 text-amber-400">•</span>
            <span>
              Scenario vs base: debt-free{' '}
              {scenarioDelta.monthsDelta >= 0 ? 'delayed' : 'accelerated'} by{' '}
              {formatMonths(Math.abs(scenarioDelta.monthsDelta))}, year-15
              equity {scenarioDelta.equityDelta >= 0 ? 'higher' : 'lower'} by{' '}
              {formatCurrency(Math.abs(scenarioDelta.equityDelta))}.
            </span>
          </li>
        )}
      </ul>
    </>
  );

  const goalsBlock = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Goal: debt-free by
        </h3>
        <NumericInput
          value={goalMonth}
          onChange={(v) => setGoalMonth(v ?? 12)}
          min={12}
          max={600}
          className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
        />
        <p className="text-xs text-slate-400">
          Current: {formatMonths(active.monthsToPayoff)}
          {active.monthsToPayoff <= goalMonth ? (
            <span className="ml-1 text-emerald-400">— on track</span>
          ) : (
            <span className="ml-1 text-amber-400">— behind goal</span>
          )}
        </p>
        {budgetForDebtFree !== null && active.monthsToPayoff > goalMonth && (
          <p className="mt-1 text-xs text-cyan-300">
            Need ~{formatCurrency(budgetForDebtFree)}/mo extra to hit by{' '}
            {formatMonths(goalMonth)}
          </p>
        )}
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${debtFreeProgress}%` }}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Goal: equity at {formatMonths(goalMonth)}
        </h3>
        <NumericInput
          value={goalEquity}
          onChange={(v) => setGoalEquity(v ?? 100_000)}
          min={100_000}
          className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
        />
        <p className="text-xs text-slate-400">
          Projected:{' '}
          {formatCurrency(snapshotAtMonth(active, goalMonth)?.totalEquity ?? 0)}
        </p>
        {budgetForEquity !== null &&
          (snapshotAtMonth(active, goalMonth)?.totalEquity ?? 0) <
            goalEquity && (
            <p className="mt-1 text-xs text-cyan-300">
              Need ~{formatCurrency(budgetForEquity)}/mo extra to reach{' '}
              {formatCurrency(goalEquity)}
            </p>
          )}
      </div>
    </div>
  );

  const milestonesBlock = year10Snap && (
    <>
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Milestones</h3>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-slate-400">Year 5 equity</p>
          <p className="font-mono text-sm tabular-nums text-cyan-300">
            {formatCurrency(snapshotAtMonth(active, 60)?.totalEquity ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Year 10 equity</p>
          <p className="font-mono text-sm tabular-nums text-cyan-300">
            {formatCurrency(year10Snap.totalEquity)}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Year 15 equity</p>
          <p className="font-mono text-sm tabular-nums text-cyan-300">
            {formatCurrency(snapshotAtMonth(active, 180)?.totalEquity ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Debt-free equity</p>
          <p className="font-mono text-sm tabular-nums text-emerald-400">
            {formatCurrency(active.finalEquity)}
          </p>
        </div>
      </div>
    </>
  );

  if (section !== 'full') {
    return (
      <div className={sectionShell(embedded, section)}>
        {showInsights && insightsBlock}
        {showGoals && (
          <div className={showInsights ? 'mt-4 border-t border-white/10 pt-4' : ''}>
            {goalsBlock}
          </div>
        )}
        {showMilestones && milestonesBlock && (
          <div className={showGoals || showInsights ? 'mt-4 border-t border-white/10 pt-4' : ''}>
            {milestonesBlock}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">{insightsBlock}</div>
      <div className="glass-card grid gap-4 p-4 sm:grid-cols-2">{goalsBlock}</div>
      {milestonesBlock && <div className="glass-card p-4">{milestonesBlock}</div>}
    </div>
  );
}
