import { useMemo, useState } from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import {
  buildStrategyLabRows,
  defaultScenarioName,
  deltaTone,
  formatDeltaMonths,
  MAX_PINNED_SCENARIOS,
  type StrategyLabRow,
} from '../lib/strategyLab';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import { formatCurrency, formatMonths } from '../lib/format';
import type { UseStrategyLabResult } from '../lib/useStrategyLab';

interface StrategyLabProps {
  portfolio: Portfolio;
  liveStrategyId: StrategyId;
  liveBudget: number;
  scenario: ScenarioConfig;
  lab: UseStrategyLabResult;
  onApply: (strategyId: StrategyId, budget: number) => void;
  embedded?: boolean;
}

function PayoffBar({
  months,
  maxMonths,
  color,
}: {
  months: number;
  maxMonths: number;
  color: string;
}) {
  const width = maxMonths > 0 ? Math.max(4, (months / maxMonths) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ScenarioRow({
  row,
  maxMonths,
  bestMonths,
  isActive,
  onApply,
  onRename,
  onDelete,
}: {
  row: StrategyLabRow;
  maxMonths: number;
  bestMonths: number;
  isActive: boolean;
  onApply: () => void;
  onRename: (name: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(row.name);
  const isBest = !row.isLive && row.metrics.monthsToPayoff === bestMonths;

  const commitRename = () => {
    const next = draftName.trim();
    if (next && next !== row.name) onRename(next);
    setEditing(false);
  };

  return (
    <tr
      className={`group border-t border-white/5 transition-colors ${
        isActive
          ? 'bg-cyan-500/10'
          : row.isLive
            ? 'bg-white/[0.03]'
            : 'hover:bg-white/[0.04]'
      }`}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: row.color }}
            aria-hidden
          />
          {editing ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraftName(row.name);
                  setEditing(false);
                }
              }}
              className="w-full min-w-0 rounded border border-cyan-500/40 bg-slate-900 px-2 py-0.5 text-sm text-slate-100"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!row.isLive) {
                  setDraftName(row.name);
                  setEditing(true);
                }
              }}
              className="truncate text-left text-sm font-medium text-slate-100"
              title={row.isLive ? 'Current slider settings' : 'Click to rename'}
            >
              {row.name}
              {row.isLive && (
                <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-slate-500">
                  live
                </span>
              )}
              {isBest && (
                <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-emerald-400">
                  fastest
                </span>
              )}
            </button>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {STRATEGY_LABELS[row.strategyId]} · {formatCurrency(row.extraMonthlyBudget)}/mo
        </p>
      </td>
      <td className="hidden px-3 py-3 sm:table-cell">
        <div className="min-w-[88px]">
          <p className="font-mono text-sm tabular-nums text-slate-200">
            {formatMonths(row.metrics.monthsToPayoff)}
          </p>
          <PayoffBar
            months={row.metrics.monthsToPayoff}
            maxMonths={maxMonths}
            color={row.color}
          />
        </div>
      </td>
      <td className="px-3 py-3 font-mono text-sm tabular-nums text-slate-300">
        {row.metrics.debtFreeLabel}
      </td>
      <td
        className={`hidden px-3 py-3 font-mono text-sm tabular-nums md:table-cell ${deltaTone(row.metrics.monthsSavedVsBaseline)}`}
      >
        {formatDeltaMonths(row.metrics.monthsSavedVsBaseline)}
      </td>
      <td
        className={`hidden px-3 py-3 font-mono text-sm tabular-nums lg:table-cell ${deltaTone(row.metrics.interestSavedVsBaseline)}`}
      >
        {row.metrics.interestSavedVsBaseline > 0
          ? formatCurrency(row.metrics.interestSavedVsBaseline)
          : '—'}
      </td>
      <td className="hidden px-3 py-3 font-mono text-sm tabular-nums text-cyan-300 xl:table-cell">
        {formatCurrency(row.metrics.year10Equity)}
      </td>
      <td className="px-2 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {!row.isLive && (
            <button
              type="button"
              onClick={onApply}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                isActive
                  ? 'bg-cyan-600 text-white'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200'
              }`}
            >
              {isActive ? 'Active' : 'Apply'}
            </button>
          )}
          {!row.isLive && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-2 py-1 text-xs text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
              aria-label={`Delete ${row.name}`}
            >
              ✕
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function StrategyLab({
  portfolio,
  liveStrategyId,
  liveBudget,
  scenario,
  lab,
  onApply,
  embedded = false,
}: StrategyLabProps) {
  const [pinning, setPinning] = useState(false);

  const rows = useMemo(
    () =>
      buildStrategyLabRows(portfolio, lab.scenarios, {
        strategyId: liveStrategyId,
        extraMonthlyBudget: liveBudget,
      }, scenario),
    [portfolio, lab.scenarios, liveStrategyId, liveBudget, scenario],
  );

  const maxMonths = Math.max(...rows.map((r) => r.metrics.monthsToPayoff), 1);
  const bestMonths = Math.min(...rows.map((r) => r.metrics.monthsToPayoff));
  const pinnedCount = lab.scenarios.filter((s) => s.isPinned).length;

  const handlePin = () => {
    void (async () => {
      setPinning(true);
      const name = defaultScenarioName(liveStrategyId, liveBudget);
      const ok = await lab.pinScenario({
        name,
        extraMonthlyBudget: liveBudget,
        strategyId: liveStrategyId,
      });
      setPinning(false);
      if (!ok && lab.error) {
        window.alert(lab.error);
      }
    })();
  };

  const shell = embedded ? 'space-y-3' : 'glass-card space-y-4 p-4';

  return (
    <section className={shell} aria-labelledby="strategy-lab-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="strategy-lab-heading"
            className="text-sm font-semibold text-slate-100"
          >
            Strategy Lab
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Pin budget + payoff combinations and compare them side-by-side. Drag
            the extra-payment slider, then pin to see how each path stacks up —
            no spreadsheets, no re-running calculators.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePin}
            disabled={!lab.canPin || pinning || lab.syncStatus === 'saving'}
            className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pinning ? 'Pinning…' : 'Pin current'}
          </button>
          <span className="text-xs text-slate-500">
            {pinnedCount}/{MAX_PINNED_SCENARIOS} pinned
            {!lab.cloudEnabled && ' · saved locally'}
          </span>
        </div>
      </div>

      {lab.loading ? (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
          Loading pinned scenarios…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-slate-900/20 px-4 py-8 text-center">
          <p className="text-sm text-slate-300">No pinned scenarios yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Set your extra budget and strategy above, then click{' '}
            <span className="text-cyan-400">Pin current</span> to compare paths.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-slate-900/60 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Scenario</th>
                <th className="hidden px-3 py-2 sm:table-cell">Payoff</th>
                <th className="px-3 py-2">Debt-free</th>
                <th className="hidden px-3 py-2 md:table-cell">Months saved</th>
                <th className="hidden px-3 py-2 lg:table-cell">Interest saved</th>
                <th className="hidden px-3 py-2 xl:table-cell">Yr-10 equity</th>
                <th className="px-2 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ScenarioRow
                  key={row.id}
                  row={row}
                  maxMonths={maxMonths}
                  bestMonths={bestMonths}
                  isActive={
                    !row.isLive &&
                    row.strategyId === liveStrategyId &&
                    row.extraMonthlyBudget === liveBudget
                  }
                  onApply={() => onApply(row.strategyId, row.extraMonthlyBudget)}
                  onRename={(name) => void lab.updateScenario(row.id, { name })}
                  onDelete={
                    row.isLive
                      ? undefined
                      : () => void lab.deleteScenario(row.id)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lab.error && (
        <p className="text-xs text-amber-400" role="alert">
          {lab.error}
        </p>
      )}
    </section>
  );
}
