import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import {
  STRATEGY_LABELS,
  type StrategyId,
} from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import {
  committedSnapshot,
  computeStrategyLabAnalysis,
  computeStrategyLabMetrics,
  findMatchingPinId,
  impactToneClass,
  resolveScenarioConfig,
  resolveStrategyId,
} from '../lib/strategyLab';
import type { StrategyLabScenario } from '../lib/strategyLabTypes';
import type { UseStrategyLabResult } from '../lib/useStrategyLab';

interface StrategyLabProps {
  portfolio: Portfolio;
  activeBudget: number;
  activeStrategy: StrategyId;
  activeScenario: ScenarioConfig;
  activeScenarioId: string;
  customOrder?: string[] | null;
  lab: UseStrategyLabResult;
  onApply: (params: {
    budget: number;
    strategy: StrategyId;
    scenario: ScenarioConfig;
  }) => void;
  embedded?: boolean;
}

function scenarioSummary(scenario: ScenarioConfig | null): string {
  if (!scenario || scenario.id === 'base') return 'Base case';
  return scenario.label || scenario.id;
}

function slotLabel(order: number): string {
  return String(order);
}

function PinCard({
  pin,
  metrics,
  monthsDelta,
  interestDelta,
  isCommitted,
  isFastest,
  showComparison,
  renamingId,
  renameValue,
  onRenameStart,
  onRenameChange,
  onRenameEnd,
  onRenameCancel,
  onDelete,
  onSelect,
}: {
  pin: StrategyLabScenario;
  metrics: ReturnType<typeof computeStrategyLabMetrics>;
  monthsDelta: number;
  interestDelta: number;
  isCommitted: boolean;
  isFastest: boolean;
  showComparison: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameEnd: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={isCommitted}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative rounded-xl border p-3 transition cursor-pointer ${
        isCommitted
          ? 'border-cyan-400/60 bg-cyan-950/30 shadow-lg shadow-cyan-900/20'
          : 'border-white/10 bg-slate-900/50 hover:border-white/20'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] font-bold text-slate-400">
              {slotLabel(pin.sortOrder)}
            </span>
            {renamingId === pin.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={onRenameEnd}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') onRenameCancel();
                }}
                className="w-full rounded border border-white/10 bg-slate-800 px-2 py-0.5 text-sm text-slate-100"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameStart();
                }}
                className="truncate text-left text-sm font-semibold text-slate-100 hover:text-cyan-300"
                title="Click to rename"
              >
                {pin.name}
              </button>
            )}
            {isCommitted && (
              <span className="shrink-0 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                Live
              </span>
            )}
            {isFastest && showComparison && (
              <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                Fastest
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {STRATEGY_LABELS[resolveStrategyId(pin.strategyId)]} · {formatCurrency(pin.extraMonthlyBudget)}/mo ·{' '}
            {scenarioSummary(pin.scenario)}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition hover:bg-red-950/50 hover:text-red-400 group-hover:opacity-100"
          title="Remove pin"
          aria-label={`Remove ${pin.name}`}
        >
          ×
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-slate-500">Debt-free</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatMonths(metrics.monthsToPayoff)}
            {monthsDelta !== 0 && showComparison && (
              <span
                className={`ml-1 ${
                  monthsDelta < 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {monthsDelta < 0 ? '−' : '+'}
                {formatMonths(Math.abs(monthsDelta))}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Interest saved</dt>
          <dd className="font-mono tabular-nums text-cyan-300">
            {formatCurrency(metrics.interestSaved)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Year 10 equity</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatCurrency(metrics.equityYear10)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Final equity</dt>
          <dd className="font-mono tabular-nums text-emerald-400">
            {formatCurrency(metrics.finalEquity)}
          </dd>
        </div>
      </dl>

      {showComparison && interestDelta !== 0 && !isCommitted && (
        <p className="mt-2 text-[10px] text-slate-500">
          vs live: {interestDelta > 0 ? '+' : ''}
          {formatCurrency(interestDelta)} interest saved
        </p>
      )}
    </article>
  );
}

export function StrategyLab({
  portfolio,
  activeBudget,
  activeStrategy,
  activeScenario,
  customOrder,
  lab,
  onApply,
  embedded = false,
}: StrategyLabProps) {
  const { preferences, setLastExploredPinId, setCommittedPinId } = lab;

  const [pinName, setPinName] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const committedPinId = useMemo(
    () =>
      findMatchingPinId(
        lab.scenarios,
        portfolio,
        activeBudget,
        activeStrategy,
        activeScenario,
      ),
    [lab.scenarios, portfolio, activeBudget, activeStrategy, activeScenario],
  );

  const committedSnapshotState = useMemo(
    () => committedSnapshot(portfolio, activeBudget, activeStrategy, activeScenario),
    [portfolio, activeBudget, activeStrategy, activeScenario],
  );

  const committedAnalysis = useMemo(
    () =>
      computeStrategyLabAnalysis(
        portfolio,
        committedSnapshotState,
        null,
        customOrder,
      ),
    [portfolio, committedSnapshotState, customOrder],
  );

  const pinnedWithMetrics = useMemo(() => {
    const committedMetrics = committedAnalysis.metrics;
    return lab.scenarios.map((pin) => {
      const scenario = resolveScenarioConfig(portfolio, pin.scenario);
      const metrics = computeStrategyLabMetrics(
        portfolio,
        pin.extraMonthlyBudget,
        pin.strategyId,
        scenario,
        customOrder,
      );
      const monthsDelta = metrics.monthsToPayoff - committedMetrics.monthsToPayoff;
      const interestDelta = metrics.interestSaved - committedMetrics.interestSaved;
      return { pin, metrics, monthsDelta, interestDelta };
    });
  }, [lab.scenarios, portfolio, committedAnalysis.metrics, customOrder]);

  const fastestMonths = useMemo(() => {
    const all = pinnedWithMetrics.map((p) => p.metrics.monthsToPayoff);
    return all.length > 0 ? Math.min(...all) : null;
  }, [pinnedWithMetrics]);

  const applyPin = useCallback(
    (pin: StrategyLabScenario) => {
      const scenario = resolveScenarioConfig(portfolio, pin.scenario);
      onApply({
        budget: pin.extraMonthlyBudget,
        strategy: resolveStrategyId(pin.strategyId),
        scenario,
      });
      void setCommittedPinId(pin.id);
      void setLastExploredPinId(pin.id);
    },
    [portfolio, onApply, setCommittedPinId, setLastExploredPinId],
  );

  const handlePinCurrent = useCallback(async () => {
    const name =
      pinName.trim() ||
      `${STRATEGY_LABELS[activeStrategy]} · ${formatCurrency(activeBudget)}/mo`;
    const created = await lab.pinCurrent({
      name,
      extraMonthlyBudget: activeBudget,
      strategyId: activeStrategy,
      scenario: activeScenario.id === 'base' ? null : activeScenario,
    });
    if (created) {
      setPinName('');
      setPinOpen(false);
      void setCommittedPinId(created.id);
    }
  }, [
    pinName,
    activeBudget,
    activeStrategy,
    activeScenario,
    lab,
    setCommittedPinId,
  ]);

  useEffect(() => {
    if (pinOpen) pinInputRef.current?.focus();
  }, [pinOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-strategy-lab]'))
      ) {
        return;
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const num = Number(e.key);
      if (num >= 1 && num <= 9) {
        const entry = pinnedWithMetrics.find((p) => p.pin.sortOrder === num);
        if (entry) {
          e.preventDefault();
          applyPin(entry.pin);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinnedWithMetrics, applyPin]);

  const shell = embedded ? 'space-y-4' : 'glass-card space-y-4 p-4';

  if (preferences.isCollapsed) {
    return (
      <div className={shell} data-strategy-lab>
        <button
          type="button"
          onClick={() => void lab.setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
              Saved Scenarios
            </p>
            <p className="truncate text-sm text-slate-200">
              {lab.scenarios.length} pinned plan{lab.scenarios.length === 1 ? '' : 's'}
              {committedPinId ? ' · live pin active' : ''}
            </p>
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={shell}
      aria-label="Saved Scenarios"
      data-strategy-lab
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Saved Scenarios</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Save different plans (budget + strategy) and compare them side by side. Click a card
            (or press <kbd className="rounded bg-slate-800 px-1">1</kbd>–
            <kbd className="rounded bg-slate-800 px-1">9</kbd>) to make it live — the dashboard
            updates instantly.
            {!lab.cloudBacked && ' Saved locally on this device.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void lab.setCollapsed(true)}
            className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-400 hover:bg-white/5"
          >
            Collapse
          </button>
          {lab.scenarios.length < 9 && (
            <button
              type="button"
              onClick={() => setPinOpen((v) => !v)}
              disabled={lab.saving}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
            >
              Pin current setup
            </button>
          )}
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 ${impactToneClass(committedAnalysis.verdictTone)}`}
      >
        <p className="text-sm leading-relaxed text-slate-100">{committedAnalysis.verdict}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Debt-free</dt>
            <dd className="font-mono tabular-nums text-slate-200">
              {formatMonths(committedAnalysis.metrics.monthsToPayoff)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Interest saved</dt>
            <dd className="font-mono tabular-nums text-cyan-300">
              {formatCurrency(committedAnalysis.metrics.interestSaved)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Year 10 equity</dt>
            <dd className="font-mono tabular-nums text-slate-200">
              {formatCurrency(committedAnalysis.metrics.equityYear10)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Final equity</dt>
            <dd className="font-mono tabular-nums text-emerald-400">
              {formatCurrency(committedAnalysis.metrics.finalEquity)}
            </dd>
          </div>
        </dl>
      </div>

      {pinOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="pin-name" className="mb-1 block text-xs text-slate-400">
              Scenario name
            </label>
            <input
              id="pin-name"
              ref={pinInputRef}
              type="text"
              value={pinName}
              onChange={(e) => setPinName(e.target.value)}
              placeholder={`${STRATEGY_LABELS[activeStrategy]} · ${formatCurrency(activeBudget)}/mo`}
              maxLength={80}
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handlePinCurrent();
                if (e.key === 'Escape') setPinOpen(false);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void handlePinCurrent()}
            disabled={lab.saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {lab.saving ? 'Saving…' : 'Save pin'}
          </button>
          <button
            type="button"
            onClick={() => setPinOpen(false)}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {lab.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {lab.error}
        </p>
      )}

      {lab.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-white/5 bg-slate-800/40"
            />
          ))}
        </div>
      ) : pinnedWithMetrics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-8 text-center">
          <p className="text-sm text-slate-300">No pinned scenarios yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Adjust budget, strategy, and stress test — then pin to build a comparison workspace.
            Click any saved card to make it live instantly.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pinnedWithMetrics.map(
            ({ pin, metrics, monthsDelta, interestDelta }) => (
              <PinCard
                key={pin.id}
                pin={pin}
                metrics={metrics}
                monthsDelta={monthsDelta}
                interestDelta={interestDelta}
                isCommitted={pin.id === committedPinId}
                isFastest={
                  fastestMonths !== null && metrics.monthsToPayoff === fastestMonths
                }
                showComparison={pinnedWithMetrics.length > 1}
                renamingId={renamingId}
                renameValue={renameValue}
                onRenameStart={() => {
                  setRenamingId(pin.id);
                  setRenameValue(pin.name);
                }}
                onRenameChange={setRenameValue}
                onRenameEnd={() => {
                  if (renameValue.trim() && renameValue !== pin.name) {
                    void lab.updateScenario(pin.id, { name: renameValue.trim() });
                  }
                  setRenamingId(null);
                }}
                onRenameCancel={() => setRenamingId(null)}
                onDelete={() => void lab.deleteScenario(pin.id)}
                onSelect={() => applyPin(pin)}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
