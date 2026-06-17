import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio } from '../lib/types';
import {
  analyzePinnedScenario,
  buildStrategyLabAnalysis,
  formatDeltaCurrency,
  formatDeltaMonths,
  type StrategyLabRow,
  type StrategyLabScenario,
} from '../lib/strategyLab';
import { STRATEGIES, type StrategyId } from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import { NumericInput } from './NumericInput';

interface StrategyLabProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  budgetMax: number;
  onStrategyChange: (strategy: StrategyId) => void;
  onBudgetChange: (budget: number) => void;
  scenarios?: StrategyLabScenario[];
  canPersist?: boolean;
  saving?: boolean;
  onPinScenario?: (input: {
    name: string;
    extraMonthlyBudget: number;
    strategyId: StrategyId;
  }) => Promise<unknown>;
  onRemoveScenario?: (id: string) => Promise<boolean>;
  compact?: boolean;
}

const STRATEGY_KEYS = Object.keys(STRATEGIES) as StrategyId[];

export function StrategyLab({
  portfolio,
  activeStrategy,
  budgetMax,
  onStrategyChange,
  onBudgetChange,
  scenarios = [],
  canPersist = false,
  saving = false,
  onPinScenario,
  onRemoveScenario,
  compact = false,
}: StrategyLabProps) {
  const [labBudget, setLabBudget] = useState(portfolio.extraMonthlyBudget);
  const [previewStrategy, setPreviewStrategy] = useState<StrategyId>(activeStrategy);
  const [pinName, setPinName] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    setLabBudget(portfolio.extraMonthlyBudget);
  }, [portfolio.extraMonthlyBudget]);

  useEffect(() => {
    setPreviewStrategy(activeStrategy);
  }, [activeStrategy]);

  const analysis = useMemo(
    () => buildStrategyLabAnalysis(portfolio, previewStrategy, labBudget),
    [portfolio, previewStrategy, labBudget],
  );

  const activeAnalysis = useMemo(
    () => buildStrategyLabAnalysis(portfolio, activeStrategy, labBudget),
    [portfolio, activeStrategy, labBudget],
  );

  const handleApplyPreview = useCallback(() => {
    onStrategyChange(previewStrategy);
    if (labBudget !== portfolio.extraMonthlyBudget) {
      onBudgetChange(labBudget);
    }
  }, [
    previewStrategy,
    labBudget,
    portfolio.extraMonthlyBudget,
    onStrategyChange,
    onBudgetChange,
  ]);

  const handlePin = useCallback(async () => {
    if (!onPinScenario) return;
    const name = pinName.trim() || `${analysis.rows.find((r) => r.id === previewStrategy)?.label ?? 'Scenario'}`;
    setPinError(null);
    const result = await onPinScenario({
      name,
      extraMonthlyBudget: labBudget,
      strategyId: previewStrategy,
    });
    if (result) {
      setPinName('');
      setShowPinForm(false);
    } else {
      setPinError('Could not save scenario. Try a different name.');
    }
  }, [onPinScenario, pinName, labBudget, previewStrategy, analysis.rows]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < STRATEGY_KEYS.length) {
        e.preventDefault();
        setPreviewStrategy(STRATEGY_KEYS[idx]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const previewChanged =
    previewStrategy !== activeStrategy || labBudget !== portfolio.extraMonthlyBudget;

  return (
    <section className="glass-card overflow-hidden" aria-label="Strategy Lab">
      <div className="border-b border-white/10 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-violet-950/30 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90">
              Strategy Lab
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100 sm:text-xl">
              {analysis.headline}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">{analysis.recommendation}</p>
          </div>
          {previewChanged && (
            <button
              type="button"
              onClick={handleApplyPreview}
              className="shrink-0 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
            >
              Apply preview
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="lab-budget"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Extra budget in lab{' '}
              <span className="font-mono text-cyan-300">{formatCurrency(labBudget)}</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="lab-budget"
                type="range"
                min={0}
                max={budgetMax}
                step={100}
                value={labBudget}
                onChange={(e) => setLabBudget(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-cyan-500"
              />
              <NumericInput
                value={labBudget}
                onChange={(v) => {
                  const n = v ?? 0;
                  setLabBudget(Math.min(budgetMax, Math.max(0, n)));
                }}
                min={0}
                max={budgetMax}
                className="w-20 rounded border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-xs text-slate-100"
              />
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Press <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">1</kbd>–
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono">6</kbd> to
            preview strategies
          </div>
        </div>
      </div>

      <div className={`grid gap-3 p-4 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
        {analysis.rows.map((row, index) => (
          <StrategyCard
            key={row.id}
            row={row}
            shortcut={index + 1}
            isPreview={row.id === previewStrategy}
            onSelect={() => setPreviewStrategy(row.id)}
            onApply={() => {
              setPreviewStrategy(row.id);
              onStrategyChange(row.id);
              if (labBudget !== portfolio.extraMonthlyBudget) {
                onBudgetChange(labBudget);
              }
            }}
          />
        ))}
      </div>

      {(canPersist || scenarios.length > 0) && (
        <div className="border-t border-white/10 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">Pinned scenarios</h3>
            {canPersist && onPinScenario && (
              <button
                type="button"
                onClick={() => setShowPinForm((v) => !v)}
                disabled={saving}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                {showPinForm ? 'Cancel' : 'Pin current preview'}
              </button>
            )}
          </div>

          {showPinForm && canPersist && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <label htmlFor="pin-name" className="mb-1 block text-xs text-slate-400">
                  Scenario name
                </label>
                <input
                  id="pin-name"
                  type="text"
                  value={pinName}
                  onChange={(e) => setPinName(e.target.value)}
                  placeholder={`${analysis.rows.find((r) => r.id === previewStrategy)?.label ?? 'Scenario'} @ ${formatCurrency(labBudget)}`}
                  maxLength={80}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => void handlePin()}
                disabled={saving}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {pinError && <p className="w-full text-xs text-red-400">{pinError}</p>}
            </div>
          )}

          {!canPersist && scenarios.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Sign in to pin and compare saved what-if scenarios across sessions.
            </p>
          )}

          {scenarios.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {scenarios.map((scenario) => {
                const pinned = analyzePinnedScenario(portfolio, scenario);
                const row = pinned.rows.find((r) => r.id === scenario.strategyId);
                return (
                  <div
                    key={scenario.id}
                    className="rounded-lg border border-white/10 bg-slate-900/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{scenario.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatCurrency(scenario.extraMonthlyBudget)}/mo ·{' '}
                          {row?.label ?? scenario.strategyId}
                        </p>
                      </div>
                      {onRemoveScenario && (
                        <button
                          type="button"
                          onClick={() => void onRemoveScenario(scenario.id)}
                          className="text-xs text-slate-500 hover:text-red-400"
                          aria-label={`Remove ${scenario.name}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {row && (
                      <p className="mt-2 font-mono text-xs text-cyan-300">
                        Debt-free {formatMonths(row.monthsToPayoff)} ·{' '}
                        {formatCurrency(row.finalEquity)} equity
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLabBudget(scenario.extraMonthlyBudget);
                        setPreviewStrategy(scenario.strategyId);
                      }}
                      className="mt-2 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      Load in lab
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div className="border-t border-white/10 bg-slate-950/50 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <span className="text-slate-400">Active plan: </span>
              <span className="font-medium text-slate-200">
                {activeAnalysis.rows.find((r) => r.isActive)?.label} at{' '}
                {formatCurrency(portfolio.extraMonthlyBudget)}/mo
              </span>
            </div>
            <div className="font-mono text-xs text-slate-400">
              Debt-free {formatMonths(activeAnalysis.previewResult.monthsToPayoff)} ·{' '}
              {formatCurrency(activeAnalysis.previewResult.totalInterestPaid)} interest
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StrategyCard({
  row,
  shortcut,
  isPreview,
  onSelect,
  onApply,
}: {
  row: StrategyLabRow;
  shortcut: number;
  isPreview: boolean;
  onSelect: () => void;
  onApply: () => void;
}) {
  const deltaTone =
    row.deltaMonths < 0 || row.deltaInterest < 0
      ? 'text-emerald-400'
      : row.deltaMonths > 0 || row.deltaInterest > 0
        ? 'text-amber-400'
        : 'text-slate-500';

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onApply}
      className={`group relative w-full rounded-xl border p-4 text-left transition ${
        isPreview
          ? 'border-cyan-400/60 bg-cyan-950/30 ring-1 ring-cyan-400/30'
          : 'border-white/10 bg-slate-900/30 hover:border-white/20 hover:bg-slate-900/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-white/10 font-mono text-[10px] text-slate-500">
              {shortcut}
            </span>
            <span className="text-sm font-semibold text-slate-100">{row.label}</span>
            {row.isBest && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Fastest
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-lg tabular-nums text-cyan-300">
            {formatMonths(row.monthsToPayoff)}
          </p>
          <p className="text-xs text-slate-400">to debt-free</p>
        </div>
        <div className="text-right">
          <p className={`text-xs font-medium ${deltaTone}`}>
            {row.isActive ? 'Current' : formatDeltaMonths(row.deltaMonths)}
          </p>
          {!row.isActive && (
            <p className={`mt-0.5 text-xs ${deltaTone}`}>
              {formatDeltaCurrency(row.deltaInterest)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-xs">
        <div>
          <p className="text-slate-500">Interest</p>
          <p className="font-mono tabular-nums text-slate-300">
            {formatCurrency(row.totalInterestPaid)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Final equity</p>
          <p className="font-mono tabular-nums text-slate-300">
            {formatCurrency(row.finalEquity)}
          </p>
        </div>
      </div>

      {isPreview && (
        <p className="mt-2 text-[10px] text-cyan-400/80">
          Previewing · double-click to apply
        </p>
      )}
    </button>
  );
}
