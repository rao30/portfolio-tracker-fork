import { useMemo, useState } from 'react';
import type { Portfolio } from '../lib/types';
import {
  runSimulation,
  STRATEGY_LABELS,
  type StrategyId,
} from '../lib/snowball';
import {
  defaultScenarioName,
  type StrategyLabMetrics,
  type StrategyLabScenario,
} from '../lib/strategyLab';
import { useStrategyLab } from '../lib/useStrategyLab';
import { formatCurrency, formatMonths } from '../lib/format';

interface StrategyLabProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  activeBudget: number;
  onApply: (budget: number, strategy: StrategyId) => void;
  embedded?: boolean;
}

function simulationOptions(portfolio: Portfolio) {
  return {
    annualRentGrowthRate: portfolio.annualRentGrowthRate,
    annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
    reinvestSurplus: portfolio.reinvestSurplus,
    monthlyReserveTarget: portfolio.monthlyReserveTarget,
    defaultVacancyRate: portfolio.defaultVacancyRate,
    defaultCapexReserveRate: portfolio.defaultCapexReserveRate,
    defaultCapexReserveFlat: portfolio.defaultCapexReserveFlat,
  };
}

function computeMetrics(
  portfolio: Portfolio,
  scenario: StrategyLabScenario,
  currentResult: ReturnType<typeof runSimulation>,
  baselineResult: ReturnType<typeof runSimulation>,
): StrategyLabMetrics {
  const simPortfolio = {
    ...portfolio,
    extraMonthlyBudget: scenario.extraMonthlyBudget,
  };
  const result = runSimulation(simPortfolio, scenario.strategyId);
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;

  return {
    monthsToPayoff: result.monthsToPayoff,
    totalInterest: result.totalInterestPaid,
    interestSaved: baselineResult.totalInterestPaid - result.totalInterestPaid,
    debtFreeYear: anchorYear + Math.floor(result.monthsToPayoff / 12),
    monthsDeltaVsCurrent: result.monthsToPayoff - currentResult.monthsToPayoff,
    interestDeltaVsCurrent: result.totalInterestPaid - currentResult.totalInterestPaid,
  };
}

function matchesCurrent(
  scenario: StrategyLabScenario,
  budget: number,
  strategy: StrategyId,
): boolean {
  return (
    scenario.extraMonthlyBudget === budget &&
    scenario.strategyId === strategy
  );
}

function DeltaBadge({ months }: { months: number }) {
  if (months === 0) {
    return (
      <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
        Current
      </span>
    );
  }

  const faster = months < 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        faster
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'bg-amber-500/15 text-amber-300'
      }`}
    >
      {faster ? '−' : '+'}
      {formatMonths(Math.abs(months))} vs now
    </span>
  );
}

function ScenarioCard({
  scenario,
  metrics,
  isCurrent,
  isActive,
  onApply,
  onRename,
  onRemove,
  renaming,
  onStartRename,
  onCancelRename,
}: {
  scenario: StrategyLabScenario;
  metrics: StrategyLabMetrics;
  isCurrent: boolean;
  isActive: boolean;
  onApply: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  renaming: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
}) {
  const [draftName, setDraftName] = useState(scenario.name);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== scenario.name) {
      onRename(trimmed);
    } else {
      setDraftName(scenario.name);
      onCancelRename();
    }
  };

  return (
    <article
      className={`group relative flex min-w-[15rem] flex-1 flex-col gap-3 rounded-xl border p-4 transition ${
        isCurrent
          ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
          : isActive
            ? 'border-violet-400/40 bg-violet-500/5'
            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraftName(scenario.name);
                  onCancelRename();
                }
              }}
              className="w-full rounded-md border border-white/15 bg-slate-900/80 px-2 py-1 text-sm text-slate-100 outline-none ring-cyan-400/40 focus:ring-2"
            />
          ) : (
            <button
              type="button"
              onClick={onStartRename}
              className="truncate text-left text-sm font-semibold text-slate-100 hover:text-cyan-200"
              title="Rename scenario"
            >
              {scenario.name}
            </button>
          )}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {formatCurrency(scenario.extraMonthlyBudget)}/mo ·{' '}
            {STRATEGY_LABELS[scenario.strategyId]}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
          title="Remove scenario"
          aria-label={`Remove ${scenario.name}`}
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-slate-500">Debt-free</p>
          <p className="font-medium text-slate-100">
            {formatMonths(metrics.monthsToPayoff)}
          </p>
          <p className="text-[10px] text-slate-500">{metrics.debtFreeYear}</p>
        </div>
        <div>
          <p className="text-slate-500">Interest saved</p>
          <p className="font-medium text-emerald-300">
            {formatCurrency(Math.max(0, metrics.interestSaved))}
          </p>
          <p className="text-[10px] text-slate-500">vs minimum-only</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <DeltaBadge months={metrics.monthsDeltaVsCurrent} />
        {!isCurrent && (
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500"
          >
            Apply
          </button>
        )}
      </div>
    </article>
  );
}

export function StrategyLab({
  portfolio,
  activeStrategy,
  activeBudget,
  onApply,
  embedded = false,
}: StrategyLabProps) {
  const {
    scenarios,
    loading,
    error,
    syncing,
    cloudBacked,
    canPinMore,
    pinScenario,
    renameScenario,
    removeScenario,
  } = useStrategyLab();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const currentResult = useMemo(
    () => runSimulation(portfolio, activeStrategy),
    [portfolio, activeStrategy],
  );

  const baselineResult = useMemo(
    () =>
      runSimulation(
        { ...portfolio, extraMonthlyBudget: 0 },
        activeStrategy,
      ),
    [portfolio, activeStrategy],
  );

  const scenarioMetrics = useMemo(() => {
    const map = new Map<string, StrategyLabMetrics>();
    for (const scenario of scenarios) {
      map.set(
        scenario.id,
        computeMetrics(portfolio, scenario, currentResult, baselineResult),
      );
    }
    return map;
  }, [scenarios, portfolio, currentResult, baselineResult]);

  const alreadyPinned = scenarios.some((scenario) =>
    matchesCurrent(scenario, activeBudget, activeStrategy),
  );

  const handlePinCurrent = async () => {
    setPinError(null);
    try {
      await pinScenario({
        name: defaultScenarioName(
          activeBudget,
          STRATEGY_LABELS[activeStrategy],
        ),
        extraMonthlyBudget: activeBudget,
        strategyId: activeStrategy,
      });
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Could not pin scenario');
    }
  };

  const shell = embedded ? 'space-y-4' : 'glass-card space-y-4 p-4';

  return (
    <section className={shell} aria-labelledby="strategy-lab-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="strategy-lab-heading" className="text-sm font-semibold text-slate-200">
            Strategy Lab
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Pin budget + payoff strategy combos and compare debt-free timing side by side —
            without losing your place when you tweak the sliders.
            {!cloudBacked && ' Scenarios save in this browser until you sign in.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!canPinMore || syncing || alreadyPinned}
          onClick={() => void handlePinCurrent()}
          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            alreadyPinned
              ? 'Current budget and strategy are already pinned'
              : !canPinMore
                ? 'Remove a scenario to pin another'
                : 'Pin current budget and strategy'
          }
        >
          {syncing ? 'Saving…' : alreadyPinned ? 'Current pinned' : 'Pin current settings'}
        </button>
      </div>

      {(error || pinError) && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {pinError ?? error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading pinned scenarios…</p>
      ) : scenarios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
          <p className="text-sm text-slate-300">No pinned scenarios yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Adjust your extra budget and strategy, then pin to build a comparison board.
            Investors often compare $3k avalanche vs $5k cashflow-boost before committing.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {scenarios.map((scenario) => {
            const metrics = scenarioMetrics.get(scenario.id);
            if (!metrics) return null;
            const isCurrent = matchesCurrent(
              scenario,
              activeBudget,
              activeStrategy,
            );

            return (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                metrics={metrics}
                isCurrent={isCurrent}
                isActive={previewId === scenario.id}
                renaming={renamingId === scenario.id}
                onStartRename={() => setRenamingId(scenario.id)}
                onCancelRename={() => setRenamingId(null)}
                onRename={(name) => {
                  void renameScenario(scenario.id, name);
                  setRenamingId(null);
                }}
                onRemove={() => {
                  if (
                    window.confirm(`Remove "${scenario.name}" from Strategy Lab?`)
                  ) {
                    void removeScenario(scenario.id);
                  }
                }}
                onApply={() => {
                  setPreviewId(scenario.id);
                  onApply(scenario.extraMonthlyBudget, scenario.strategyId);
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
