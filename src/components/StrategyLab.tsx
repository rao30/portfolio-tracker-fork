import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import {
  runSimulation,
  SCENARIO_PRESETS,
  snapshotAtMonth,
  STRATEGY_LABELS,
  type StrategyId,
} from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import type { StrategyLabMetrics, StrategyLabScenario } from '../lib/strategyLabTypes';
import type { UseStrategyLabResult } from '../lib/useStrategyLab';

interface StrategyLabProps {
  portfolio: Portfolio;
  activeBudget: number;
  activeStrategy: StrategyId;
  activeScenario: ScenarioConfig;
  activeScenarioId: string;
  lab: UseStrategyLabResult;
  onApply: (params: {
    budget: number;
    strategy: StrategyId;
    scenario: ScenarioConfig;
  }) => void;
  embedded?: boolean;
}

function resolveScenarioConfig(
  portfolio: Portfolio,
  scenario: ScenarioConfig | null,
): ScenarioConfig {
  if (!scenario) return SCENARIO_PRESETS[0];
  if (scenario.id === 'base') return SCENARIO_PRESETS[0];
  const preset = SCENARIO_PRESETS.find((s) => s.id === scenario.id);
  if (preset) return preset;
  if (scenario.sellProperty) {
    const sell = portfolio.properties.find((p) => p.name === scenario.sellProperty);
    if (sell) {
      return {
        id: scenario.id,
        label: scenario.label || `Sell ${sell.name}`,
        sellProperty: sell.name,
        sellClosingCostRate: scenario.sellClosingCostRate,
        sellAtMonth: scenario.sellAtMonth,
        sellProceedsToDebt: scenario.sellProceedsToDebt,
      };
    }
  }
  return scenario;
}

function computeMetrics(
  portfolio: Portfolio,
  budget: number,
  strategyId: StrategyId,
  scenario: ScenarioConfig,
): StrategyLabMetrics {
  const working: Portfolio = { ...portfolio, extraMonthlyBudget: budget };
  const baseline = runSimulation(working, 'baseline', scenario);
  const active = runSimulation(working, strategyId, scenario);
  const year10 = snapshotAtMonth(active, 120);
  const year15 = snapshotAtMonth(active, 180);

  return {
    monthsToPayoff: active.monthsToPayoff,
    interestSaved: baseline.totalInterestPaid - active.totalInterestPaid,
    equityYear10: year10?.totalEquity ?? 0,
    equityYear15: year15?.totalEquity ?? 0,
    finalEquity: active.finalEquity,
  };
}

function scenarioSummary(scenario: ScenarioConfig | null): string {
  if (!scenario || scenario.id === 'base') return 'Base case';
  return scenario.label || scenario.id;
}

function slotLabel(order: number): string {
  return String(order);
}

export function StrategyLab({
  portfolio,
  activeBudget,
  activeStrategy,
  activeScenario,
  activeScenarioId,
  lab,
  onApply,
  embedded = false,
}: StrategyLabProps) {
  const [pinName, setPinName] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const baselineMetrics = useMemo(
    () => computeMetrics(portfolio, activeBudget, activeStrategy, activeScenario),
    [portfolio, activeBudget, activeStrategy, activeScenario],
  );

  const pinnedWithMetrics = useMemo(() => {
    return lab.scenarios.map((pin) => {
      const scenario = resolveScenarioConfig(portfolio, pin.scenario);
      const metrics = computeMetrics(
        portfolio,
        pin.extraMonthlyBudget,
        pin.strategyId,
        scenario,
      );
      const monthsDelta = metrics.monthsToPayoff - baselineMetrics.monthsToPayoff;
      const interestDelta = metrics.interestSaved - baselineMetrics.interestSaved;
      return { pin, scenario, metrics, monthsDelta, interestDelta };
    });
  }, [lab.scenarios, portfolio, baselineMetrics]);

  const fastestMonths = useMemo(() => {
    const all = pinnedWithMetrics.map((p) => p.metrics.monthsToPayoff);
    return all.length > 0 ? Math.min(...all) : null;
  }, [pinnedWithMetrics]);

  const matchesCurrent = useCallback(
    (pin: StrategyLabScenario, scenario: ScenarioConfig) =>
      pin.extraMonthlyBudget === activeBudget &&
      pin.strategyId === activeStrategy &&
      (pin.scenario?.id ?? 'base') === activeScenarioId,
    [activeBudget, activeStrategy, activeScenarioId],
  );

  const handleApply = useCallback(
    (pin: StrategyLabScenario, scenario: ScenarioConfig) => {
      setActivePinId(pin.id);
      onApply({
        budget: pin.extraMonthlyBudget,
        strategy: pin.strategyId,
        scenario,
      });
    },
    [onApply],
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
      setActivePinId(created.id);
    }
  }, [pinName, activeBudget, activeStrategy, activeScenario, lab]);

  useEffect(() => {
    if (pinOpen) pinInputRef.current?.focus();
  }, [pinOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
          handleApply(entry.pin, entry.scenario);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinnedWithMetrics, handleApply]);

  const shell = embedded ? 'space-y-4' : 'glass-card space-y-4 p-4';

  return (
    <section className={shell} aria-label="Strategy Lab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Strategy Lab</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Pin payoff plans and compare them side-by-side — budget, strategy, and stress
            test in one click. Press <kbd className="rounded bg-slate-800 px-1">1</kbd>–
            <kbd className="rounded bg-slate-800 px-1">9</kbd> to switch.
            {!lab.cloudBacked && ' Saved locally on this device.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            Adjust your budget, strategy, and stress test — then pin to build a comparison
            workspace. Competitors like Stessa don&apos;t offer this; spreadsheets can&apos;t
            switch plans in one click.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pinnedWithMetrics.map(
            ({ pin, scenario, metrics, monthsDelta, interestDelta }) => {
              const isActive =
                activePinId === pin.id || matchesCurrent(pin, scenario);
              const isFastest =
                fastestMonths !== null && metrics.monthsToPayoff === fastestMonths;

              return (
                <article
                  key={pin.id}
                  className={`group relative rounded-xl border p-3 transition ${
                    isActive
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
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim() && renameValue !== pin.name) {
                                void lab.updateScenario(pin.id, { name: renameValue.trim() });
                              }
                              setRenamingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="w-full rounded border border-white/10 bg-slate-800 px-2 py-0.5 text-sm text-slate-100"
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(pin.id);
                              setRenameValue(pin.name);
                            }}
                            className="truncate text-left text-sm font-semibold text-slate-100 hover:text-cyan-300"
                            title="Click to rename"
                          >
                            {pin.name}
                          </button>
                        )}
                        {isFastest && pinnedWithMetrics.length > 1 && (
                          <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            Fastest
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {STRATEGY_LABELS[pin.strategyId]} ·{' '}
                        {formatCurrency(pin.extraMonthlyBudget)}/mo ·{' '}
                        {scenarioSummary(pin.scenario)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void lab.deleteScenario(pin.id)}
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
                        {monthsDelta !== 0 && (
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
                        {interestDelta !== 0 && pinnedWithMetrics.length > 1 && (
                          <span
                            className={`ml-1 text-[10px] ${
                              interestDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {interestDelta > 0 ? '+' : ''}
                            {formatCurrency(interestDelta)}
                          </span>
                        )}
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

                  <button
                    type="button"
                    onClick={() => handleApply(pin, scenario)}
                    className={`mt-3 w-full rounded-lg py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-cyan-600 text-white'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {isActive ? 'Active' : 'Apply to dashboard'}
                  </button>
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}
