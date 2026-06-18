import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Portfolio } from '../lib/types';
import {
  computePayoffLandscape,
  defaultLandscapeRange,
  portfolioSimulationSignature,
} from '../lib/payoffLandscape';
import type { LandscapeCell, LandscapeMetric } from '../lib/payoffLandscapeTypes';
import { formatCurrency, formatMonths } from '../lib/format';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import type { UsePayoffLandscapeResult } from '../lib/usePayoffLandscape';
import { NumericInput } from './NumericInput';

interface PayoffLandscapeProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  activeBudget: number;
  landscapeHook: UsePayoffLandscapeResult;
  onApply: (params: { budget: number; strategy: StrategyId }) => void;
  embedded?: boolean;
}

const METRIC_LABELS: Record<LandscapeMetric, string> = {
  monthsToPayoff: 'Months to debt-free',
  totalInterest: 'Total interest paid',
  interestSaved: 'Interest saved vs baseline',
};

const STRATEGY_SHORT: Partial<Record<StrategyId, string>> = {
  highestRate: 'Avalanche',
  highestPiPerDollar: 'P&I/$',
  highestCashflowBoost: 'Cashflow',
  lowestBalance: 'Snowball',
  lowestDscr: 'DSCR',
  highestInterestCost: 'Int. cost',
};

function cellBackground(intensity: number): string {
  const hue = Math.round(160 - intensity * 95);
  const lightness = Math.round(18 + intensity * 22);
  return `hsl(${hue} 55% ${lightness}%)`;
}

function formatMetricValue(cell: LandscapeCell, metric: LandscapeMetric): string {
  if (metric === 'monthsToPayoff') return formatMonths(cell.monthsToPayoff);
  if (metric === 'totalInterest') return formatCurrency(cell.totalInterest);
  return formatCurrency(cell.interestSaved);
}

export function PayoffLandscape({
  portfolio,
  activeStrategy,
  activeBudget,
  landscapeHook,
  onApply,
  embedded = false,
}: PayoffLandscapeProps) {
  const { preferences, setCollapsed, setMetric, setBudgetRange } = landscapeHook;
  const [focusRow, setFocusRow] = useState(0);
  const [focusCol, setFocusCol] = useState(0);
  const [rangeDraft, setRangeDraft] = useState({
    min: preferences.budgetMin,
    max: preferences.budgetMax,
    step: preferences.budgetStep,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRangeDraft({
      min: preferences.budgetMin,
      max: preferences.budgetMax,
      step: preferences.budgetStep,
    });
  }, [preferences.budgetMin, preferences.budgetMax, preferences.budgetStep]);

  const simulationSignature = portfolioSimulationSignature(portfolio);

  const suggestedRange = useMemo(
    () => defaultLandscapeRange(portfolio),
    [portfolio, simulationSignature],
  );

  const grid = useMemo(
    () =>
      computePayoffLandscape(portfolio, {
        metric: preferences.metric,
        budgetMin: preferences.budgetMin,
        budgetMax: preferences.budgetMax,
        budgetStep: preferences.budgetStep,
        activeStrategy,
        activeBudget,
      }),
    [
      portfolio,
      simulationSignature,
      preferences.metric,
      preferences.budgetMin,
      preferences.budgetMax,
      preferences.budgetStep,
      activeStrategy,
      activeBudget,
    ],
  );

  useEffect(() => {
    const rowIdx = grid.budgets.findIndex((b) => b === Math.round(activeBudget));
    const colIdx = grid.strategies.indexOf(activeStrategy);
    if (rowIdx >= 0) setFocusRow(rowIdx);
    if (colIdx >= 0) setFocusCol(colIdx);
  }, [grid.budgets, grid.strategies, activeBudget, activeStrategy]);

  const focusedCell = grid.cells[focusRow]?.[focusCol] ?? null;

  const applyCell = useCallback(
    (cell: LandscapeCell) => {
      onApply({ budget: cell.budget, strategy: cell.strategyId });
    },
    [onApply],
  );

  const handleRangeChange = useCallback(
    (patch: Partial<typeof rangeDraft>) => {
      const next = { ...rangeDraft, ...patch };
      setRangeDraft(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void setBudgetRange(
          Math.max(0, next.min),
          Math.max(next.min, next.max),
          Math.max(100, Math.min(5000, next.step)),
        );
      }, 500);
    },
    [rangeDraft, setBudgetRange],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gridRef.current?.contains(document.activeElement) &&
          !(e.target instanceof HTMLElement && e.target.closest('[data-landscape-grid]'))) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const rowCount = grid.cells.length;
      const colCount = grid.strategies.length;
      if (rowCount === 0 || colCount === 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusRow((r) => Math.max(0, r - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusRow((r) => Math.min(rowCount - 1, r + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusCol((c) => Math.max(0, c - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusCol((c) => Math.min(colCount - 1, c + 1));
      } else if (e.key === 'Enter' && focusedCell) {
        e.preventDefault();
        applyCell(focusedCell);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid.cells.length, grid.strategies.length, focusedCell, applyCell]);

  const shell = embedded
    ? 'space-y-4'
    : 'glass-card overflow-hidden border-violet-500/20';

  if (preferences.isCollapsed) {
    return (
      <div className={shell}>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
              Payoff Landscape
            </p>
            <p className="truncate text-sm text-slate-200">
              {grid.optimalCell
                ? `Optimal: ${STRATEGY_LABELS[grid.optimalCell.strategyId]} at ${formatCurrency(grid.optimalCell.budget)}/mo`
                : 'Explore budget × strategy heatmap'}
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
    <section className={shell} aria-label="Payoff Landscape heatmap">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-400">
            Payoff Landscape
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Full budget × strategy matrix · click or arrow keys + Enter to apply
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

      <div className="mx-4 mt-4 flex flex-wrap items-center gap-2">
        {(Object.keys(METRIC_LABELS) as LandscapeMetric[]).map((metric) => (
          <button
            key={metric}
            type="button"
            onClick={() => void setMetric(metric)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              preferences.metric === metric
                ? 'border-violet-400/50 bg-violet-500/15 text-violet-200'
                : 'border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            {METRIC_LABELS[metric]}
          </button>
        ))}
      </div>

      <div className="mx-4 mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-slate-900/50 p-3">
        <label className="text-xs text-slate-500">
          Budget min
          <NumericInput
            value={rangeDraft.min}
            onChange={(v) => handleRangeChange({ min: v ?? 0 })}
            min={0}
            max={1_000_000}
            className="mt-1 block w-24 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-500">
          Budget max
          <NumericInput
            value={rangeDraft.max}
            onChange={(v) => handleRangeChange({ max: v ?? 5000 })}
            min={0}
            max={1_000_000}
            className="mt-1 block w-24 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-500">
          Step
          <NumericInput
            value={rangeDraft.step}
            onChange={(v) => handleRangeChange({ step: v ?? 500 })}
            min={100}
            max={5000}
            className="mt-1 block w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setRangeDraft({
              min: suggestedRange.budgetMin,
              max: suggestedRange.budgetMax,
              step: suggestedRange.budgetStep,
            });
            void setBudgetRange(
              suggestedRange.budgetMin,
              suggestedRange.budgetMax,
              suggestedRange.budgetStep,
            );
          }}
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5"
        >
          Auto-fit range
        </button>
      </div>

      {grid.optimalCell && (
        <p className="mx-4 mt-3 text-xs text-emerald-300/90">
          Sweet spot:{' '}
          <span className="font-medium text-emerald-200">
            {STRATEGY_LABELS[grid.optimalCell.strategyId]}
          </span>{' '}
          at {formatCurrency(grid.optimalCell.budget)}/mo —{' '}
          {formatMetricValue(grid.optimalCell, preferences.metric)}
          {preferences.metric !== 'monthsToPayoff' && (
            <> · debt-free in {formatMonths(grid.optimalCell.monthsToPayoff)}</>
          )}
        </p>
      )}

      <div
        ref={gridRef}
        data-landscape-grid
        tabIndex={0}
        className="mx-4 mb-4 mt-4 overflow-x-auto rounded-xl border border-white/10 outline-none focus:ring-1 focus:ring-violet-500/40"
        aria-label="Payoff heatmap grid"
      >
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-950/95 px-2 py-2 text-left font-medium text-slate-500">
                Budget
              </th>
              {grid.strategies.map((strategyId) => (
                <th
                  key={strategyId}
                  className="px-1 py-2 text-center font-medium text-slate-400"
                  title={STRATEGY_LABELS[strategyId]}
                >
                  {STRATEGY_SHORT[strategyId] ?? strategyId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.cells.map((row, rowIdx) => (
              <tr key={grid.budgets[rowIdx]}>
                <td className="sticky left-0 z-10 bg-slate-950/95 px-2 py-1 font-mono tabular-nums text-slate-400">
                  {formatCurrency(grid.budgets[rowIdx])}
                </td>
                {row.map((cell, colIdx) => {
                  const isActive =
                    cell.strategyId === activeStrategy &&
                    cell.budget === Math.round(activeBudget);
                  const isFocused = rowIdx === focusRow && colIdx === focusCol;

                  return (
                    <td key={`${cell.budget}-${cell.strategyId}`} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusRow(rowIdx);
                          setFocusCol(colIdx);
                          applyCell(cell);
                        }}
                        onFocus={() => {
                          setFocusRow(rowIdx);
                          setFocusCol(colIdx);
                        }}
                        title={`${STRATEGY_LABELS[cell.strategyId]} · ${formatCurrency(cell.budget)}/mo · ${formatMetricValue(cell, preferences.metric)}`}
                        className={`relative flex h-11 w-full min-w-[4.5rem] flex-col items-center justify-center rounded-md px-1 transition ${
                          isFocused ? 'ring-2 ring-violet-400 ring-offset-1 ring-offset-slate-950' : ''
                        } ${isActive ? 'ring-2 ring-cyan-400' : ''}`}
                        style={{ backgroundColor: cellBackground(cell.intensity) }}
                      >
                        <span className="font-mono text-[11px] font-medium tabular-nums text-slate-100">
                          {formatMetricValue(cell, preferences.metric)}
                        </span>
                        {cell.isOptimal && (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/50" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {focusedCell && (
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
          <span>
            Focused:{' '}
            <span className="text-slate-200">
              {STRATEGY_LABELS[focusedCell.strategyId]} · {formatCurrency(focusedCell.budget)}/mo
            </span>
          </span>
          <button
            type="button"
            onClick={() => applyCell(focusedCell)}
            className="rounded-lg bg-violet-600 px-2.5 py-1 font-medium text-white hover:bg-violet-500"
          >
            Apply selection
          </button>
        </div>
      )}
    </section>
  );
}
