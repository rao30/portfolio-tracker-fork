import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SimulationResult } from '../lib/types';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import { NumericInput } from './NumericInput';
import type { StrategyLabScenario } from '../lib/useStrategyLab';

interface StrategyLabProps {
  results: SimulationResult[];
  activeStrategy: StrategyId;
  budget: number;
  budgetMax: number;
  onBudgetChange: (value: number) => void;
  onSelect: (strategy: StrategyId) => void;
  pinnedScenarios?: StrategyLabScenario[];
  canPin?: boolean;
  pinning?: boolean;
  onPinCurrent?: (name: string) => Promise<{ ok: boolean; message?: string }>;
  onLoadScenario?: (scenario: StrategyLabScenario) => void;
  onRemoveScenario?: (id: string) => Promise<{ ok: boolean; message?: string }>;
  compact?: boolean;
}

interface RankedStrategy {
  id: StrategyId;
  label: string;
  months: number;
  interest: number;
  equity: number;
  interestSaved: number;
  monthsSaved: number;
  rank: number;
}

function isStrategyId(value: string): value is StrategyId {
  return value in STRATEGY_LABELS;
}

export function StrategyLab({
  results,
  activeStrategy,
  budget,
  budgetMax,
  onBudgetChange,
  onSelect,
  pinnedScenarios = [],
  canPin = false,
  pinning = false,
  onPinCurrent,
  onLoadScenario,
  onRemoveScenario,
  compact = false,
}: StrategyLabProps) {
  const [hoveredId, setHoveredId] = useState<StrategyId | null>(null);
  const [pinName, setPinName] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const baseline = useMemo(
    () => results.find((r) => r.strategy === 'baseline') ?? null,
    [results],
  );

  const ranked = useMemo((): RankedStrategy[] => {
    const extraOnly = results.filter(
      (r): r is SimulationResult & { strategy: StrategyId } =>
        r.strategy !== 'baseline' && isStrategyId(r.strategy),
    );

    const sorted = [...extraOnly].sort((a, b) => {
      if (a.monthsToPayoff !== b.monthsToPayoff) {
        return a.monthsToPayoff - b.monthsToPayoff;
      }
      return a.totalInterestPaid - b.totalInterestPaid;
    });

    return sorted.map((r, index) => ({
      id: r.strategy,
      label: STRATEGY_LABELS[r.strategy],
      months: r.monthsToPayoff,
      interest: r.totalInterestPaid,
      equity: r.finalEquity,
      interestSaved: baseline
        ? baseline.totalInterestPaid - r.totalInterestPaid
        : 0,
      monthsSaved: baseline ? baseline.monthsToPayoff - r.monthsToPayoff : 0,
      rank: index + 1,
    }));
  }, [results, baseline]);

  const winner = ranked[0] ?? null;
  const compareId = hoveredId ?? activeStrategy;
  const compareRow = ranked.find((r) => r.id === compareId) ?? winner;
  const activeRow = ranked.find((r) => r.id === activeStrategy) ?? winner;

  useEffect(() => {
    const idx = ranked.findIndex((r) => r.id === activeStrategy);
    if (idx >= 0) setFocusedIndex(idx);
  }, [activeStrategy, ranked]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!ranked.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(ranked.length - 1, focusedIndex + 1);
        setFocusedIndex(next);
        onSelect(ranked[next].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.max(0, focusedIndex - 1);
        setFocusedIndex(next);
        onSelect(ranked[next].id);
      } else if (e.key === 'Enter' && ranked[focusedIndex]) {
        onSelect(ranked[focusedIndex].id);
      }
    },
    [ranked, focusedIndex, onSelect],
  );

  const handlePin = async () => {
    if (!onPinCurrent) return;
    const name =
      pinName.trim() ||
      `${STRATEGY_LABELS[activeStrategy]} @ ${formatCurrency(budget)}`;
    setPinError(null);
    const result = await onPinCurrent(name);
    if (result.ok) {
      setShowPinForm(false);
      setPinName('');
    } else {
      setPinError(result.message ?? 'Could not pin scenario');
    }
  };

  return (
    <section
      className="glass-card overflow-hidden"
      aria-label="Strategy Lab — live payoff explorer"
    >
      <div className="border-b border-white/10 bg-gradient-to-br from-cyan-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90">
              Strategy Lab
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100 sm:text-xl">
              Live payoff explorer
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Drag the budget slider — all {ranked.length} strategies re-rank
              instantly. No recalculate button, no spreadsheet exports.
            </p>
          </div>
          {canPin && onPinCurrent && (
            <div className="flex flex-col items-end gap-2">
              {!showPinForm ? (
                <button
                  type="button"
                  onClick={() => setShowPinForm(true)}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                >
                  Pin this scenario
                </button>
              ) : (
                <div className="flex flex-col items-end gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={pinName}
                    onChange={(e) => setPinName(e.target.value)}
                    placeholder={`${STRATEGY_LABELS[activeStrategy]} @ ${formatCurrency(budget)}`}
                    maxLength={80}
                    className="w-56 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pinning}
                      onClick={() => void handlePin()}
                      className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {pinning ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPinForm(false);
                        setPinError(null);
                      }}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {pinError && (
                <p className="text-xs text-red-400" role="alert">
                  {pinError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-5">
          <label
            htmlFor="strategy-lab-budget"
            className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-slate-300"
          >
            <span>Extra monthly budget</span>
            <span className="font-mono text-2xl tabular-nums text-cyan-300">
              {formatCurrency(budget)}
            </span>
          </label>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">$0</span>
            <input
              id="strategy-lab-budget"
              type="range"
              min={0}
              max={budgetMax}
              step={50}
              value={budget}
              onChange={(e) => onBudgetChange(Number(e.target.value))}
              className="h-2.5 flex-1 cursor-pointer accent-cyan-400"
              aria-valuetext={formatCurrency(budget)}
            />
            <span className="hidden text-xs text-slate-500 sm:inline">
              {formatCurrency(budgetMax)}
            </span>
            <NumericInput
              value={budget}
              onChange={(v) => {
                const n = v ?? 0;
                onBudgetChange(Math.min(budgetMax, Math.max(0, n)));
              }}
              min={0}
              max={budgetMax}
              className="w-24 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm tabular-nums text-slate-100"
            />
          </div>
        </div>
      </div>

      {winner && (
        <div className="border-b border-white/10 bg-emerald-950/20 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">
                Fastest payoff at this budget
              </p>
              <p className="mt-0.5 text-base font-semibold text-slate-100">
                {winner.label}
                {winner.id === activeStrategy && (
                  <span className="ml-2 rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-300">
                    Active
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Debt-free</p>
                <p className="font-mono tabular-nums text-emerald-300">
                  {formatMonths(winner.months)}
                </p>
              </div>
              {winner.interestSaved > 0 && (
                <div>
                  <p className="text-xs text-slate-500">Interest saved vs min</p>
                  <p className="font-mono tabular-nums text-emerald-300">
                    {formatCurrency(winner.interestSaved)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500">Final equity</p>
                <p className="font-mono tabular-nums text-cyan-300">
                  {formatCurrency(winner.equity)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {pinnedScenarios.length > 0 && onLoadScenario && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <span className="text-xs font-medium text-slate-500">Pinned:</span>
          {pinnedScenarios.map((scenario) => (
            <span
              key={scenario.id}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-800/60 pl-3 pr-1 py-1 text-xs text-slate-200"
            >
              <button
                type="button"
                onClick={() => onLoadScenario(scenario)}
                className="hover:text-cyan-300"
                title={`Load ${scenario.name}`}
              >
                {scenario.name}
                <span className="ml-1 font-mono text-slate-500">
                  {formatCurrency(scenario.extraMonthlyBudget)}
                </span>
              </button>
              {onRemoveScenario && (
                <button
                  type="button"
                  onClick={() => void onRemoveScenario(scenario.id)}
                  className="rounded-full px-1.5 py-0.5 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
                  aria-label={`Remove ${scenario.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div
        ref={tableRef}
        className="overflow-x-auto"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="listbox"
        aria-label="Payoff strategies ranked by speed"
        aria-activedescendant={
          ranked[focusedIndex] ? `strategy-row-${ranked[focusedIndex].id}` : undefined
        }
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium sm:px-5">#</th>
              <th className="px-4 py-3 font-medium sm:px-5">Strategy</th>
              <th className="px-4 py-3 font-medium sm:px-5">Payoff</th>
              {!compact && (
                <th className="px-4 py-3 font-medium sm:px-5">Interest</th>
              )}
              <th className="px-4 py-3 font-medium sm:px-5">Saved</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell sm:px-5">
                Equity
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, index) => {
              const isActive = row.id === activeStrategy;
              const isHovered = row.id === hoveredId;
              const isFocused = index === focusedIndex;
              return (
                <tr
                  key={row.id}
                  id={`strategy-row-${row.id}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setHoveredId(row.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect(row.id)}
                  className={`cursor-pointer border-b border-white/5 transition-colors ${
                    isActive
                      ? 'bg-cyan-500/10'
                      : isHovered || isFocused
                        ? 'bg-white/5'
                        : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-400 sm:px-5">
                    {row.rank}
                    {row.rank === 1 && (
                      <span className="ml-1 text-amber-400" aria-hidden>
                        ★
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={`font-medium ${
                        isActive ? 'text-cyan-200' : 'text-slate-200'
                      }`}
                    >
                      {row.label}
                    </span>
                    {isActive && (
                      <span className="ml-2 text-xs text-cyan-400/80">
                        selected
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-200 sm:px-5">
                    {formatMonths(row.months)}
                    {row.monthsSaved > 0 && (
                      <span className="ml-1 text-xs text-emerald-400/90">
                        −{formatMonths(row.monthsSaved)}
                      </span>
                    )}
                  </td>
                  {!compact && (
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300 sm:px-5">
                      {formatCurrency(row.interest)}
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono tabular-nums text-emerald-400/90 sm:px-5">
                    {row.interestSaved > 0
                      ? formatCurrency(row.interestSaved)
                      : '—'}
                  </td>
                  <td className="hidden px-4 py-3 font-mono tabular-nums text-cyan-300/90 sm:table-cell sm:px-5">
                    {formatCurrency(row.equity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {compareRow && activeRow && compareRow.id !== activeRow.id && (
        <div className="border-t border-white/10 bg-slate-900/40 px-4 py-3 text-xs text-slate-400 sm:px-5">
          Comparing{' '}
          <span className="text-slate-200">{compareRow.label}</span> vs active{' '}
          <span className="text-slate-200">{activeRow.label}</span>:{' '}
          {compareRow.months < activeRow.months ? (
            <span className="text-emerald-400">
              {formatMonths(activeRow.months - compareRow.months)} faster
            </span>
          ) : compareRow.months > activeRow.months ? (
            <span className="text-amber-400">
              {formatMonths(compareRow.months - activeRow.months)} slower
            </span>
          ) : (
            <span className="text-slate-300">same payoff timeline</span>
          )}
          {compareRow.interestSaved !== activeRow.interestSaved && (
            <>
              {' '}
              · interest delta{' '}
              <span className="font-mono text-slate-300">
                {formatCurrency(
                  Math.abs(compareRow.interestSaved - activeRow.interestSaved),
                )}
              </span>
            </>
          )}
        </div>
      )}

      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-600 sm:px-5">
        ↑↓ to cycle strategies · Enter to select · Click a row to adopt
      </p>
    </section>
  );
}
