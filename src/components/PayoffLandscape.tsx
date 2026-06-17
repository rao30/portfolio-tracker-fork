import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Portfolio } from '../lib/types';
import {
  computePayoffLandscape,
  defaultLandscapeViewport,
  formatLandscapeMetric,
  landscapeCellScore,
  landscapeColor,
} from '../lib/payoffLandscape';
import {
  LANDSCAPE_METRIC_LABELS,
  type PayoffLandscapeMetric,
} from '../lib/payoffLandscapeTypes';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import type { UsePayoffLandscapeResult } from '../lib/usePayoffLandscape';
import { NumericInput } from './NumericInput';

interface PayoffLandscapeProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  budgetMax: number;
  landscapeHook: UsePayoffLandscapeResult;
  onApply: (strategy: StrategyId, budget: number) => void;
  embedded?: boolean;
}

function shortStrategyLabel(id: StrategyId): string {
  const full = STRATEGY_LABELS[id];
  const paren = full.indexOf('(');
  if (paren > 0) return full.slice(0, paren).trim();
  if (full.length > 22) return `${full.slice(0, 20)}…`;
  return full;
}

export function PayoffLandscape({
  portfolio,
  activeStrategy,
  budgetMax,
  landscapeHook,
  onApply,
  embedded = false,
}: PayoffLandscapeProps) {
  const { preferences, setCollapsed, setMetric, setViewport } = landscapeHook;
  const gridRef = useRef<HTMLDivElement>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [focusStrategy, setFocusStrategy] = useState(0);
  const [focusBudget, setFocusBudget] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewport = useMemo(() => {
    const defaults = defaultLandscapeViewport(portfolio, budgetMax);
    return {
      metric: preferences.metric,
      budgetMin: preferences.budgetMin ?? defaults.budgetMin,
      budgetMax: Math.min(preferences.budgetMax ?? defaults.budgetMax, budgetMax),
      budgetStep: preferences.budgetStep ?? defaults.budgetStep,
    };
  }, [preferences, portfolio, budgetMax]);

  const analysis = useMemo(
    () => computePayoffLandscape(portfolio, viewport, activeStrategy),
    [portfolio, viewport, activeStrategy],
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, (typeof analysis.cells)[0]>();
    for (const cell of analysis.cells) {
      map.set(`${cell.strategyId}:${cell.budget}`, cell);
    }
    return map;
  }, [analysis.cells]);

  const hoveredCell = hoveredKey ? cellMap.get(hoveredKey) ?? null : null;

  const persistViewport = useCallback(
    (patch: { budgetMin?: number; budgetMax?: number; budgetStep?: number }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void setViewport(patch);
      }, 500);
    },
    [setViewport],
  );

  useEffect(() => {
    const stratIdx = analysis.strategies.indexOf(activeStrategy);
    const budgetIdx = analysis.budgets.indexOf(portfolio.extraMonthlyBudget);
    if (stratIdx >= 0) setFocusStrategy(stratIdx);
    if (budgetIdx >= 0) setFocusBudget(budgetIdx);
  }, [activeStrategy, portfolio.extraMonthlyBudget, analysis.strategies, analysis.budgets]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const rowCount = analysis.strategies.length;
      const colCount = analysis.budgets.length;
      let r = focusStrategy;
      let c = focusBudget;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        r = Math.max(0, r - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        r = Math.min(rowCount - 1, r + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        c = Math.max(0, c - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        c = Math.min(colCount - 1, c + 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const strat = analysis.strategies[r];
        const budget = analysis.budgets[c];
        onApply(strat, budget);
        return;
      } else {
        return;
      }

      setFocusStrategy(r);
      setFocusBudget(c);
      const key = `${analysis.strategies[r]}:${analysis.budgets[c]}`;
      setHoveredKey(key);
    },
    [analysis.strategies, analysis.budgets, focusStrategy, focusBudget, onApply],
  );

  if (preferences.isCollapsed) {
    return (
      <section
        className={
          embedded
            ? 'px-1 py-2'
            : 'glass-card overflow-hidden rounded-2xl border border-white/10'
        }
      >
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Payoff Landscape</h2>
            <p className="text-xs text-slate-500">
              Strategy × budget heatmap · click any cell to apply
            </p>
          </div>
          <span className="text-xs text-cyan-400">Expand</span>
        </button>
      </section>
    );
  }

  const shell = embedded
    ? 'space-y-3'
    : 'glass-card overflow-hidden rounded-2xl border border-white/10';

  return (
    <section className={shell} aria-label="Payoff Landscape">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Payoff Landscape</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Every strategy × budget combo at a glance — greener is better. Click or press Enter to
            apply.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(true)}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
        >
          Collapse
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {(Object.keys(LANDSCAPE_METRIC_LABELS) as PayoffLandscapeMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => void setMetric(m)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              viewport.metric === m
                ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200'
                : 'border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            {LANDSCAPE_METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 px-4">
        <label className="text-xs text-slate-500">
          Min budget
          <NumericInput
            value={viewport.budgetMin}
            onChange={(v) => persistViewport({ budgetMin: v ?? 0 })}
            min={0}
            max={viewport.budgetMax - 100}
            className="mt-1 block w-24 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm tabular-nums text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-500">
          Max budget
          <NumericInput
            value={viewport.budgetMax}
            onChange={(v) => persistViewport({ budgetMax: v ?? 5000 })}
            min={viewport.budgetMin + 100}
            max={budgetMax}
            className="mt-1 block w-24 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm tabular-nums text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-500">
          Step
          <select
            value={viewport.budgetStep}
            onChange={(e) => persistViewport({ budgetStep: Number(e.target.value) })}
            className="mt-1 block w-24 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-sm text-slate-100"
          >
            {[250, 500, 1000, 2000].map((s) => (
              <option key={s} value={s}>
                ${s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hoveredCell && (
        <div className="mx-4 mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-2 text-xs text-slate-200">
          <span className="font-medium">{STRATEGY_LABELS[hoveredCell.strategyId]}</span>
          {' · '}
          {formatCurrency(hoveredCell.budget)}/mo
          {' · '}
          {formatMonths(hoveredCell.monthsToPayoff)} to debt-free
          {' · '}
          {formatCurrency(hoveredCell.totalInterest)} interest
          {hoveredCell.isOptimal && (
            <span className="ml-2 text-emerald-400">★ Fastest path</span>
          )}
        </div>
      )}

      <div
        ref={gridRef}
        className="mx-4 my-4 overflow-x-auto"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="grid"
        aria-label="Payoff strategy and budget heatmap"
      >
        <div
          className="inline-grid min-w-full gap-px rounded-xl border border-white/10 bg-white/10 p-px"
          style={{
            gridTemplateColumns: `minmax(7rem, 1.2fr) repeat(${analysis.budgets.length}, minmax(3.5rem, 1fr))`,
          }}
        >
          <div className="bg-slate-950/90 p-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Strategy ↓ / Budget →
          </div>
          {analysis.budgets.map((b) => (
            <div
              key={b}
              className="bg-slate-950/90 p-2 text-center text-[10px] font-mono tabular-nums text-slate-400"
            >
              {b >= 1000 ? `$${(b / 1000).toFixed(b % 1000 === 0 ? 0 : 1)}k` : `$${b}`}
            </div>
          ))}

          {analysis.strategies.map((strategyId, rowIdx) => (
            <div key={strategyId} className="contents">
              <div
                className="flex items-center bg-slate-950/90 px-2 py-1 text-[10px] leading-tight text-slate-300"
                title={STRATEGY_LABELS[strategyId]}
              >
                {shortStrategyLabel(strategyId)}
              </div>
              {analysis.budgets.map((budget, colIdx) => {
                const cell = cellMap.get(`${strategyId}:${budget}`)!;
                const metricValue =
                  viewport.metric === 'monthsToPayoff'
                    ? cell.monthsToPayoff
                    : viewport.metric === 'totalInterest'
                      ? cell.totalInterest
                      : cell.interestSaved;
                const score = landscapeCellScore(
                  metricValue,
                  viewport.metric,
                  analysis.metricMin,
                  analysis.metricMax,
                );
                const isFocused = rowIdx === focusStrategy && colIdx === focusBudget;
                const key = `${strategyId}:${budget}`;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onApply(strategyId, budget)}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => {
                      setFocusStrategy(rowIdx);
                      setFocusBudget(colIdx);
                      setHoveredKey(key);
                    }}
                    className={`relative min-h-[2.25rem] p-1 text-center font-mono text-[10px] tabular-nums transition hover:ring-2 hover:ring-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                      isFocused ? 'ring-2 ring-cyan-400' : ''
                    } ${cell.isCurrent ? 'ring-2 ring-white/80' : ''}`}
                    style={{ backgroundColor: landscapeColor(score) }}
                    title={`${STRATEGY_LABELS[strategyId]} at ${formatCurrency(budget)}/mo`}
                    aria-label={`${STRATEGY_LABELS[strategyId]}, ${formatCurrency(budget)} per month, ${formatLandscapeMetric(metricValue, viewport.metric)}`}
                  >
                    <span className="text-slate-100">
                      {formatLandscapeMetric(metricValue, viewport.metric)}
                    </span>
                    {cell.isOptimal && (
                      <span className="absolute right-0.5 top-0.5 text-[8px] text-emerald-300">
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mx-4 mb-4 text-center text-xs text-slate-500">
        Optimal: {STRATEGY_LABELS[analysis.optimal.strategyId]} at{' '}
        {formatCurrency(analysis.optimal.budget)}/mo ·{' '}
        {formatMonths(analysis.optimal.monthsToPayoff)} to debt-free
        {analysis.currentCell &&
          !analysis.currentCell.isOptimal &&
          analysis.currentCell.monthsToPayoff > analysis.optimal.monthsToPayoff && (
            <span className="text-amber-300/90">
              {' '}
              · You&apos;re {formatMonths(
                analysis.currentCell.monthsToPayoff - analysis.optimal.monthsToPayoff,
              )}{' '}
              behind the fastest path
            </span>
          )}
      </p>
    </section>
  );
}
