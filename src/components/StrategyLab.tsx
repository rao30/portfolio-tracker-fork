import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildStrategyLabRows,
  STRATEGY_LAB_MAX_SCENARIOS,
  type StrategyLabRow,
} from '../lib/strategyLab';
import { useStrategyLab } from '../lib/useStrategyLab';
import { formatCurrency, formatCurrencyCompact, formatMonths } from '../lib/format';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import type { Portfolio } from '../lib/types';
import {
  ChartCard,
  chartColors,
  chartMargin,
  monthScaleXAxisProps,
  yAxisLabel,
} from './chart-theme';

const SCENARIO_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#fb923c',
  '#60a5fa',
  '#e879f9',
];

interface StrategyLabProps {
  portfolio: Portfolio;
  activeBudget: number;
  activeStrategyId: StrategyId;
  onApply: (budget: number, strategyId: StrategyId) => void;
}

export function StrategyLab({
  portfolio,
  activeBudget,
  activeStrategyId,
  onApply,
}: StrategyLabProps) {
  const {
    scenarios,
    loading,
    syncStatus,
    error,
    canSync,
    pinCurrent,
    removeScenario,
    renameScenario,
    hasActivePinned,
  } = useStrategyLab();

  const [pinning, setPinning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expanded, setExpanded] = useState(true);

  const rows = useMemo(
    () => buildStrategyLabRows(portfolio, scenarios, activeBudget, activeStrategyId),
    [portfolio, scenarios, activeBudget, activeStrategyId],
  );

  const chartData = useMemo(() => {
    if (rows.length === 0) return [];
    const monthSet = new Set<number>();
    for (const row of rows) {
      for (const pt of row.balancePath) monthSet.add(pt.month);
    }
    const months = [...monthSet].sort((a, b) => a - b);
    return months.map((month) => {
      const point: Record<string, number> = { month };
      for (const row of rows) {
        const snap = row.balancePath.find((p) => p.month === month);
        if (snap) point[row.id] = snap.balance;
      }
      return point;
    });
  }, [rows]);

  const handlePin = useCallback(async () => {
    if (hasActivePinned(activeBudget, activeStrategyId)) return;
    setPinning(true);
    await pinCurrent(activeBudget, activeStrategyId);
    setPinning(false);
  }, [activeBudget, activeStrategyId, hasActivePinned, pinCurrent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        void handlePin();
      }
      if (e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const idx = Number(e.key) - 1;
        const row = rows[idx];
        if (row) onApply(row.extraMonthlyBudget, row.strategyId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePin, onApply, rows]);

  const startRename = (row: StrategyLabRow) => {
    setEditingId(row.id);
    setEditName(row.name);
  };

  const commitRename = async () => {
    if (editingId && editName.trim()) {
      await renameScenario(editingId, editName);
    }
    setEditingId(null);
  };

  const alreadyPinned = hasActivePinned(activeBudget, activeStrategyId);
  const atLimit = scenarios.length >= STRATEGY_LAB_MAX_SCENARIOS;

  return (
    <section className="glass-card overflow-hidden" aria-label="Strategy Lab">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Strategy Lab</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Pin budget + strategy combos and compare debt-free dates side by side — no
            spreadsheets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSync && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                syncStatus === 'synced'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : syncStatus === 'error'
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-slate-500/15 text-slate-400'
              }`}
            >
              {syncStatus === 'synced' ? 'Cloud synced' : syncStatus}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            type="button"
            onClick={() => void handlePin()}
            disabled={pinning || alreadyPinned || atLimit || loading}
            title="Pin current budget and strategy (Ctrl+P)"
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pinning ? 'Pinning…' : alreadyPinned ? 'Already pinned' : 'Pin current'}
          </button>
        </div>
      </header>

      {error && (
        <p className="border-b border-white/10 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {expanded && (
        <div className="p-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading scenarios…</p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-slate-900/30 px-4 py-8 text-center">
              <p className="text-sm text-slate-300">No pinned scenarios yet</p>
              <p className="mt-2 text-xs text-slate-500">
                Adjust your extra budget and strategy above, then click{' '}
                <strong className="text-slate-400">Pin current</strong> or press{' '}
                <kbd className="rounded border border-white/15 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl+P
                </kbd>
                . Compare up to {STRATEGY_LAB_MAX_SCENARIOS} what-if paths instantly.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Scenario</th>
                      <th className="pb-2 pr-3 font-medium">Budget</th>
                      <th className="pb-2 pr-3 font-medium">Strategy</th>
                      <th className="pb-2 pr-3 font-medium">Debt-free</th>
                      <th className="pb-2 pr-3 font-medium">Interest saved</th>
                      <th className="pb-2 pr-3 font-medium">Y10 equity</th>
                      <th className="pb-2 pr-3 font-medium">Final CF/mo</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <ScenarioRow
                        key={row.id}
                        row={row}
                        index={idx}
                        color={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                        editingId={editingId}
                        editName={editName}
                        onEditNameChange={setEditName}
                        onStartRename={() => startRename(row)}
                        onCommitRename={() => void commitRename()}
                        onCancelRename={() => setEditingId(null)}
                        onApply={() =>
                          onApply(row.extraMonthlyBudget, row.strategyId)
                        }
                        onRemove={() => void removeScenario(row.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {chartData.length > 1 && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <ChartCard title="Total debt — scenario overlay">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={chartMargin}>
                        <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
                        <XAxis
                          {...monthScaleXAxisProps(
                            chartData[chartData.length - 1]?.month ?? 120,
                            'Month',
                          )}
                        />
                        <YAxis
                          stroke={chartColors.axis}
                          fontSize={10}
                          tick={{ fill: chartColors.axis }}
                          tickFormatter={(v: number) => formatCurrencyCompact(v)}
                          label={yAxisLabel('Balance')}
                        />
                        <Tooltip
                          contentStyle={{
                            background: chartColors.tooltipBg,
                            border: `1px solid ${chartColors.tooltipBorder}`,
                            borderRadius: 8,
                            fontSize: 11,
                          }}
                          formatter={(value: number, name: string) => {
                            const row = rows.find((r) => r.id === name);
                            return [
                              formatCurrency(value),
                              row?.name ?? name,
                            ];
                          }}
                          labelFormatter={(m) => `Month ${m}`}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10 }}
                          formatter={(value: string) => {
                            const row = rows.find((r) => r.id === value);
                            return row?.name ?? value;
                          }}
                        />
                        {rows.map((row, idx) => (
                          <Line
                            key={row.id}
                            type="monotone"
                            dataKey={row.id}
                            name={row.id}
                            stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                            strokeWidth={row.isActive ? 2.5 : 1.5}
                            strokeDasharray={row.isActive ? undefined : '4 2'}
                            dot={false}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              )}

              <p className="mt-3 text-[10px] text-slate-500">
                Press <kbd className="font-mono">1–{Math.min(rows.length, 9)}</kbd> to
                apply a scenario. Active row matches your current budget + strategy.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

interface ScenarioRowProps {
  row: StrategyLabRow;
  index: number;
  color: string;
  editingId: string | null;
  editName: string;
  onEditNameChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onApply: () => void;
  onRemove: () => void;
}

function ScenarioRow({
  row,
  index,
  color,
  editingId,
  editName,
  onEditNameChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onApply,
  onRemove,
}: ScenarioRowProps) {
  const isEditing = editingId === row.id;

  return (
    <tr
      className={`border-b border-white/5 transition hover:bg-white/[0.03] ${
        row.isActive ? 'bg-cyan-500/10' : ''
      }`}
    >
      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500">
        <span
          className="mr-1.5 inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {index + 1}
      </td>
      <td className="max-w-[140px] py-2.5 pr-3">
        {isEditing ? (
          <input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            autoFocus
            className="w-full rounded border border-cyan-500/50 bg-slate-900 px-2 py-1 text-slate-100"
          />
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            className="truncate text-left font-medium text-slate-200 hover:text-cyan-300"
            title="Click to rename"
          >
            {row.name}
            {row.isActive && (
              <span className="ml-1.5 text-[10px] text-cyan-400">active</span>
            )}
          </button>
        )}
      </td>
      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
        {formatCurrency(row.extraMonthlyBudget)}
      </td>
      <td className="max-w-[120px] truncate py-2.5 pr-3 text-slate-400">
        {STRATEGY_LABELS[row.strategyId]}
      </td>
      <td className="py-2.5 pr-3">
        <span className="font-mono tabular-nums text-emerald-300">
          {formatMonths(row.metrics.monthsToPayoff)}
        </span>
        <span className="ml-1 text-slate-500">({row.metrics.debtFreeLabel})</span>
        {row.metrics.monthsSavedVsBaseline > 0 && (
          <span className="ml-1 text-[10px] text-cyan-400">
            −{formatMonths(row.metrics.monthsSavedVsBaseline)}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 font-mono tabular-nums text-cyan-300">
        {formatCurrency(row.metrics.interestSavedVsBaseline)}
      </td>
      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
        {formatCurrency(row.metrics.equityAtYear10)}
      </td>
      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
        {formatCurrency(row.metrics.finalMonthlyCashflow)}
      </td>
      <td className="py-2.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onApply}
            disabled={row.isActive}
            className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5 disabled:opacity-40"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-red-500/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10"
            aria-label={`Remove ${row.name}`}
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}
