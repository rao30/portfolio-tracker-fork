import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio, SimulationResult } from '../lib/types';
import {
  computeGoalBudgetPreviewDelta,
  computeGoalCommandAnalysis,
  GOAL_PRESETS,
  simMonthFromCalendarYear,
} from '../lib/goalCommand';
import type { GoalStatusTone } from '../lib/goalCommandTypes';
import {
  calendarYearFromMonth,
  formatCurrency,
  formatMonths,
  formatSimulationMonthShort,
} from '../lib/format';
import { generateInsights, snapshotAtMonth, type StrategyId } from '../lib/snowball';
import type { UseGoalCommandResult } from '../lib/useGoalCommand';
import { NumericInput } from './NumericInput';

interface GoalTrackerProps {
  portfolio: Portfolio;
  active: SimulationResult;
  baseline: SimulationResult;
  strategyId: StrategyId;
  customOrder?: string[] | null;
  budgetMax: number;
  goalHook: UseGoalCommandResult;
  scenarioDelta?: {
    monthsDelta: number;
    equityDelta: number;
  } | null;
  onApplyBudget: (value: number) => void;
  /** insights = narrative only; goals = goal command; milestones = horizon grid; full = desktop */
  section?: 'full' | 'insights' | 'goals' | 'milestones';
  embedded?: boolean;
}

function statusToneClass(tone: GoalStatusTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
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
  customOrder,
  budgetMax,
  goalHook,
  scenarioDelta,
  onApplyBudget,
  section = 'full',
  embedded = false,
}: GoalTrackerProps) {
  const committedBudget = portfolio.extraMonthlyBudget;
  const { preferences, setCollapsed, setActiveGoalType, setDebtFreeTargetMonth, setEquityTargetMonth, setEquityTargetValue, setLastExploredBudget } =
    goalHook;

  const [previewBudget, setPreviewBudget] = useState(
    preferences.lastExploredBudget ?? committedBudget,
  );
  const sectionRef = useRef<HTMLElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreviewBudget(committedBudget);
  }, [committedBudget]);

  const deferredPreviewBudget = useDeferredValue(previewBudget);
  const isPreviewStale = previewBudget !== deferredPreviewBudget;
  const isDirty = previewBudget !== committedBudget;

  const analysis = useMemo(
    () =>
      computeGoalCommandAnalysis(portfolio, active, strategyId, preferences, customOrder),
    [portfolio, active, strategyId, preferences, customOrder],
  );

  const previewDelta = useMemo(
    () =>
      isDirty
        ? computeGoalBudgetPreviewDelta(
            portfolio,
            deferredPreviewBudget,
            strategyId,
            preferences,
            customOrder,
          )
        : null,
    [portfolio, deferredPreviewBudget, strategyId, preferences, customOrder, isDirty],
  );

  const insights = useMemo(
    () => generateInsights(portfolio, active, baseline, strategyId),
    [portfolio, active, baseline, strategyId],
  );

  const handlePreviewChange = useCallback(
    (value: number) => {
      const clamped = Math.min(budgetMax, Math.max(0, value));
      const stepped = Math.round(clamped / 100) * 100;
      setPreviewBudget(stepped);
    },
    [budgetMax],
  );

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    onApplyBudget(previewBudget);
    void setLastExploredBudget(previewBudget);
  }, [isDirty, onApplyBudget, previewBudget, setLastExploredBudget]);

  const handleReset = useCallback(() => {
    setPreviewBudget(committedBudget);
  }, [committedBudget]);

  const handleApplyRequired = useCallback(() => {
    if (analysis.requiredBudget == null) return;
    onApplyBudget(analysis.requiredBudget);
    setPreviewBudget(analysis.requiredBudget);
    void setLastExploredBudget(analysis.requiredBudget);
  }, [analysis.requiredBudget, onApplyBudget, setLastExploredBudget]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isDirty) return undefined;
    debounceRef.current = setTimeout(() => {
      void setLastExploredBudget(previewBudget);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, previewBudget, setLastExploredBudget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-goal-command]'))
      ) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handlePreviewChange(previewBudget + 100);
      } else if (e.key === '-') {
        e.preventDefault();
        handlePreviewChange(previewBudget - 100);
      } else if (e.key === 'Enter' && isDirty) {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApply, handlePreviewChange, handleReset, isDirty, previewBudget]);

  const goalYear = calendarYearFromMonth(
    preferences.debtFreeTargetMonth,
    portfolio.simulationAnchorYear,
  );
  const equityYear = calendarYearFromMonth(
    preferences.equityTargetMonth,
    portfolio.simulationAnchorYear,
  );

  const showInsights = section === 'full' || section === 'insights';
  const showGoals = section === 'full' || section === 'goals';
  const showMilestones = section === 'full' || section === 'milestones';

  const year10Snap = snapshotAtMonth(active, 120);

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
              {formatMonths(Math.abs(scenarioDelta.monthsDelta))}, year-15 equity{' '}
              {scenarioDelta.equityDelta >= 0 ? 'higher' : 'lower'} by{' '}
              {formatCurrency(Math.abs(scenarioDelta.equityDelta))}.
            </span>
          </li>
        )}
      </ul>
    </>
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

  const freedomDateBlock = (
    <section
      ref={sectionRef}
      className={embedded ? 'space-y-4' : 'glass-card overflow-hidden border-emerald-500/20'}
      aria-label="Freedom Date Command Center"
      data-goal-command
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
            Freedom Date
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Calendar goal · safe budget preview · one-click apply
          </p>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={() => void setCollapsed(true)}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
          >
            Collapse
          </button>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void setActiveGoalType('debtFree')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              preferences.activeGoalType === 'debtFree'
                ? 'bg-emerald-600 text-white'
                : 'border border-white/10 text-slate-300 hover:bg-white/5'
            }`}
          >
            Debt-free date
          </button>
          <button
            type="button"
            onClick={() => void setActiveGoalType('equity')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              preferences.activeGoalType === 'equity'
                ? 'bg-emerald-600 text-white'
                : 'border border-white/10 text-slate-300 hover:bg-white/5'
            }`}
          >
            Equity target
          </button>
        </div>
      </div>

      <div
        className={`mx-4 mt-4 rounded-xl border px-4 py-3 ${statusToneClass(analysis.statusTone)}`}
      >
        <p className="text-sm font-medium text-slate-100">{analysis.statusHeadline}</p>
        <p className="mt-1 text-xs text-slate-400">{analysis.statusDetail}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${analysis.progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Goal: {analysis.goalLabel} · Projected: {analysis.projectedLabel}
        </p>
      </div>

      {preferences.activeGoalType === 'debtFree' ? (
        <div className="mx-4 mt-4 space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Freedom date target
          </p>
          <div className="flex flex-wrap gap-2">
            {GOAL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => void setDebtFreeTargetMonth(preset.months)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  preferences.debtFreeTargetMonth === preset.months
                    ? 'bg-emerald-600/80 text-white'
                    : 'border border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400" htmlFor="goal-year">
              Target year
            </label>
            <input
              id="goal-year"
              type="range"
              min={portfolio.simulationAnchorYear + 1}
              max={portfolio.simulationAnchorYear + 50}
              value={goalYear}
              onChange={(e) => {
                const year = Number(e.target.value);
                void setDebtFreeTargetMonth(simMonthFromCalendarYear(year, portfolio));
              }}
              className="min-w-0 flex-1 accent-emerald-500"
            />
            <span className="shrink-0 font-mono text-sm text-emerald-300">
              {formatSimulationMonthShort(
                preferences.debtFreeTargetMonth,
                portfolio.simulationAnchorYear,
                portfolio.simulationAnchorMonth,
              )}
            </span>
          </div>
          {!analysis.isOnTrack && analysis.requiredBudget != null && (
            <button
              type="button"
              onClick={handleApplyRequired}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Apply {formatCurrency(analysis.requiredBudget)}/mo to hit goal
            </button>
          )}
        </div>
      ) : (
        <div className="mx-4 mt-4 space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Equity target
          </p>
          <NumericInput
            value={preferences.equityTargetValue}
            onChange={(v) => void setEquityTargetValue(v ?? 1_000_000)}
            min={100_000}
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400" htmlFor="equity-year">
              Horizon year
            </label>
            <input
              id="equity-year"
              type="range"
              min={portfolio.simulationAnchorYear + 1}
              max={portfolio.simulationAnchorYear + 50}
              value={equityYear}
              onChange={(e) => {
                const year = Number(e.target.value);
                void setEquityTargetMonth(simMonthFromCalendarYear(year, portfolio));
              }}
              className="min-w-0 flex-1 accent-emerald-500"
            />
            <span className="shrink-0 font-mono text-sm text-emerald-300">
              {formatSimulationMonthShort(
                preferences.equityTargetMonth,
                portfolio.simulationAnchorYear,
                portfolio.simulationAnchorMonth,
              )}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Projected: {formatCurrency(analysis.projectedEquityAtHorizon)}
          </p>
          {!analysis.isOnTrack && analysis.requiredBudget != null && (
            <button
              type="button"
              onClick={handleApplyRequired}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Apply {formatCurrency(analysis.requiredBudget)}/mo to hit goal
            </button>
          )}
        </div>
      )}

      <div className="mx-4 my-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Budget what-if
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Explore extra payoff budget without changing your portfolio until you apply.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handlePreviewChange(previewBudget - 100)}
            className="rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
            aria-label="Decrease preview budget"
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={budgetMax}
            step={100}
            value={previewBudget}
            onChange={(e) => handlePreviewChange(Number(e.target.value))}
            className="min-w-0 flex-1 accent-cyan-500"
          />
          <button
            type="button"
            onClick={() => handlePreviewChange(previewBudget + 100)}
            className="rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
            aria-label="Increase preview budget"
          >
            +
          </button>
          <span className="w-24 shrink-0 text-right font-mono text-sm text-cyan-300">
            {formatCurrency(previewBudget)}/mo
          </span>
        </div>

        {isDirty && (
          <div
            className={`mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 transition-opacity ${
              isPreviewStale ? 'opacity-60' : 'opacity-100'
            }`}
          >
            <p className="text-xs text-slate-200">
              Preview at {formatCurrency(previewBudget)}/mo — portfolio still uses{' '}
              {formatCurrency(committedBudget)}/mo
            </p>
            {previewDelta && (
              <p className="mt-1 text-xs text-slate-400">
                Debt-free: {previewDelta.debtFreeLabelCommitted} →{' '}
                <span className="text-slate-200">{previewDelta.debtFreeLabelPreview}</span>
                {previewDelta.monthsDelta !== 0 && (
                  <span
                    className={
                      previewDelta.monthsDelta < 0 ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    {' '}
                    ({previewDelta.monthsDelta < 0 ? '−' : '+'}
                    {formatMonths(Math.abs(previewDelta.monthsDelta))})
                  </span>
                )}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500"
              >
                Apply budget
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mb-4 rounded-xl border border-white/10 bg-slate-900/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Timeline
        </p>
        <div className="relative mt-4 h-2 rounded-full bg-slate-800">
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-cyan-400"
            style={{ left: '0%' }}
            title="Today"
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-emerald-400"
            style={{
              left: `${Math.min(100, (preferences.debtFreeTargetMonth / 600) * 100)}%`,
            }}
            title={`Goal: ${analysis.goalLabel}`}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-violet-400"
            style={{
              left: `${Math.min(100, (analysis.projectedPayoffMonth / 600) * 100)}%`,
            }}
            title={`Projected: ${analysis.debtFreeLabel}`}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-500">
          <span>Today</span>
          <span>Goal</span>
          <span>Projected</span>
        </div>
      </div>
    </section>
  );

  if (section === 'insights') {
    return <div className={sectionShell(embedded, section)}>{insightsBlock}</div>;
  }

  if (section === 'milestones') {
    return (
      <div className={sectionShell(embedded, section)}>
        {milestonesBlock}
      </div>
    );
  }

  if (section === 'goals') {
    if (preferences.isCollapsed && !embedded) {
      return (
        <div className="glass-card overflow-hidden border-emerald-500/20" data-goal-command>
          <button
            type="button"
            onClick={() => void setCollapsed(false)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Freedom Date
              </p>
              <p className="truncate text-sm text-slate-200">{analysis.statusHeadline}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-slate-500">Projected</p>
              <p className="text-sm font-medium text-slate-200">{analysis.projectedLabel}</p>
            </div>
            <span className="shrink-0 text-slate-500" aria-hidden>
              ▼
            </span>
          </button>
        </div>
      );
    }
    return <div className={sectionShell(embedded, section)}>{freedomDateBlock}</div>;
  }

  return (
    <div className="space-y-4">
      {preferences.isCollapsed ? (
        <div className="glass-card overflow-hidden border-emerald-500/20" data-goal-command>
          <button
            type="button"
            onClick={() => void setCollapsed(false)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Freedom Date
              </p>
              <p className="truncate text-sm text-slate-200">{analysis.statusHeadline}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-slate-500">Projected</p>
              <p className="text-sm font-medium text-slate-200">{analysis.projectedLabel}</p>
            </div>
            <span className="shrink-0 text-slate-500" aria-hidden>
              ▼
            </span>
          </button>
        </div>
      ) : (
        freedomDateBlock
      )}
      <div className="glass-card p-4">{insightsBlock}</div>
      {milestonesBlock && <div className="glass-card p-4">{milestonesBlock}</div>}
    </div>
  );
}
