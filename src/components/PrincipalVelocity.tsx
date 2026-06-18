import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Portfolio } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  computePrincipalVelocityAnalysis,
  computePrincipalVelocityPreviewDelta,
  formatPrincipalDelta,
  peakMonthLabel,
  principalDeltaToneClass,
} from '../lib/principalVelocity';
import type {
  PrincipalVelocityHorizon,
  PrincipalVelocityViewMode,
} from '../lib/principalVelocityTypes';
import { formatCurrency, formatMonths, propertyColor } from '../lib/format';
import type { UsePrincipalVelocityResult } from '../lib/usePrincipalVelocity';
import { NumericInput } from './NumericInput';
import { chartColors, chartMargin, timelineXAxisProps } from './chart-theme';

interface PrincipalVelocityProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  customOrder?: string[] | null;
  budgetMax: number;
  velocityHook: UsePrincipalVelocityResult;
  onApplyBudget: (value: number) => void;
  embedded?: boolean;
}

const HORIZON_OPTIONS: PrincipalVelocityHorizon[] = [12, 36, 60, 120, 180, 360];

function verdictToneClass(tone: 'positive' | 'caution' | 'neutral'): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export function PrincipalVelocity({
  portfolio,
  activeStrategy,
  customOrder,
  budgetMax,
  velocityHook,
  onApplyBudget,
  embedded = false,
}: PrincipalVelocityProps) {
  const committedBudget = portfolio.extraMonthlyBudget;
  const {
    preferences,
    loading,
    saving,
    setCollapsed,
    setViewMode,
    setHorizonMonths,
    setShowBaselineComparison,
    setPinnedPropertyName,
    setLastExploredBudget,
  } = velocityHook;

  const [previewBudget, setPreviewBudget] = useState(
    preferences.lastExploredBudget ?? committedBudget,
  );
  const [isScrubbing, setIsScrubbing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setPreviewBudget(committedBudget);
  }, [committedBudget]);

  useEffect(() => {
    if (!loading && preferences.lastExploredBudget != null) {
      setPreviewBudget(preferences.lastExploredBudget);
    }
  }, [loading, preferences.lastExploredBudget]);

  const deferredPreviewBudget = useDeferredValue(previewBudget);
  const isPreviewStale = previewBudget !== deferredPreviewBudget;
  const isDirty = previewBudget !== committedBudget;

  const committedAnalysis = useMemo(
    () =>
      computePrincipalVelocityAnalysis(
        portfolio,
        activeStrategy,
        preferences.horizonMonths,
        customOrder,
        committedBudget,
      ),
    [portfolio, activeStrategy, preferences.horizonMonths, customOrder, committedBudget],
  );

  const previewAnalysis = useMemo(
    () =>
      computePrincipalVelocityAnalysis(
        portfolio,
        activeStrategy,
        preferences.horizonMonths,
        customOrder,
        deferredPreviewBudget,
      ),
    [portfolio, activeStrategy, preferences.horizonMonths, customOrder, deferredPreviewBudget],
  );

  const previewDelta = useMemo(
    () =>
      isDirty
        ? computePrincipalVelocityPreviewDelta(
            portfolio,
            activeStrategy,
            committedBudget,
            deferredPreviewBudget,
            preferences.horizonMonths,
            customOrder,
          )
        : null,
    [
      portfolio,
      activeStrategy,
      committedBudget,
      deferredPreviewBudget,
      preferences.horizonMonths,
      customOrder,
      isDirty,
    ],
  );

  const displayAnalysis = isDirty ? previewAnalysis : committedAnalysis;

  const chartData = useMemo(() => {
    return displayAnalysis.points.map((p) => ({
      month: p.month,
      scheduled: p.scheduledPrincipal,
      extra: p.extraPrincipal,
      total: p.totalPrincipal,
      cumulative: p.cumulativePrincipal,
      baseline: p.baselinePrincipal,
      baselineCumulative: p.baselineCumulative,
      wealth: p.wealthVelocity,
    }));
  }, [displayAnalysis.points]);

  const handleBudgetChange = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(budgetMax, value));
      setPreviewBudget(clamped);
      setIsScrubbing(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setIsScrubbing(false);
        void setLastExploredBudget(clamped);
      }, 400);
    },
    [budgetMax, setLastExploredBudget],
  );

  const handleApply = useCallback(() => {
    onApplyBudget(previewBudget);
    void setLastExploredBudget(null);
  }, [onApplyBudget, previewBudget, setLastExploredBudget]);

  const handleDiscard = useCallback(() => {
    setPreviewBudget(committedBudget);
    void setLastExploredBudget(null);
  }, [committedBudget, setLastExploredBudget]);

  if (loading) {
    return (
      <section className={embedded ? '' : 'app-surface p-4'}>
        <div className="h-48 animate-pulse rounded-lg bg-white/5" />
      </section>
    );
  }

  const shell = embedded ? '' : 'app-surface p-4';

  return (
    <section ref={sectionRef} className={`${shell} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-100">Equity Buildup Speed</h2>
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              Hidden income
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Every loan payment converts a little debt into equity you own — a hidden return that grows
            as loans get paid off. Drag the extra-budget slider to preview how much faster equity builds.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(!preferences.isCollapsed)}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
        >
          {preferences.isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!preferences.isCollapsed && (
        <>
          <div
            className={`rounded-xl border p-3 text-sm ${verdictToneClass(displayAnalysis.verdictTone)}`}
          >
            {displayAnalysis.verdict}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Year 1 principal
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-slate-100">
                {formatCurrency(displayAnalysis.year1TotalPrincipal)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                vs {formatCurrency(displayAnalysis.baselineYear1Principal)} minimums
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Acceleration
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-emerald-300">
                {displayAnalysis.accelerationFactorYear1.toFixed(2)}×
              </p>
              <p className="mt-1 text-xs text-slate-500">year-one vs minimum payments</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Peak monthly principal
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-slate-100">
                {formatCurrency(displayAnalysis.peakPrincipalAmount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                at {peakMonthLabel(displayAnalysis.peakPrincipalMonth)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Year 5 avg / mo
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-slate-100">
                {formatCurrency(displayAnalysis.year5AverageMonthlyPrincipal)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                hidden-income ratio {displayAnalysis.hiddenIncomeRatio.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Extra snowball budget</p>
                <p className="text-xs text-slate-500">
                  Committed {formatCurrency(committedBudget)}/mo
                  {isDirty && (
                    <span className="text-amber-300">
                      {' '}
                      · preview {formatCurrency(previewBudget)}/mo
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isDirty && (
                  <>
                    <button
                      type="button"
                      onClick={handleDiscard}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500"
                    >
                      Apply {formatCurrency(previewBudget)}/mo
                    </button>
                  </>
                )}
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={budgetMax}
              step={100}
              value={previewBudget}
              onChange={(e) => handleBudgetChange(Number(e.target.value))}
              className="w-full accent-cyan-500"
              aria-label="Preview extra snowball budget"
            />
            <div className="mt-2 flex items-center gap-2">
              <NumericInput
                value={previewBudget}
                onChange={(value) => handleBudgetChange(value ?? 0)}
                min={0}
                max={budgetMax}
                step={100}
                className="w-28"
              />
              <span className="text-xs text-slate-500">/mo extra</span>
              {(isScrubbing || isPreviewStale) && (
                <span className="text-xs text-amber-400">Updating…</span>
              )}
            </div>

            {previewDelta && (
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span className={principalDeltaToneClass(previewDelta.year1PrincipalDelta)}>
                  Year 1 principal {formatPrincipalDelta(previewDelta.year1PrincipalDelta)}
                </span>
                <span className={principalDeltaToneClass(previewDelta.peakPrincipalDelta)}>
                  Peak {formatPrincipalDelta(previewDelta.peakPrincipalDelta)}
                </span>
                <span className="text-slate-400">
                  Acceleration {previewDelta.accelerationDelta >= 0 ? '+' : ''}
                  {previewDelta.accelerationDelta.toFixed(2)}×
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['monthly', 'cumulative', 'stacked'] as PrincipalVelocityViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void setViewMode(mode)}
                className={`rounded-lg px-2.5 py-1 text-xs capitalize ${
                  preferences.viewMode === mode
                    ? 'bg-violet-500/20 text-violet-200'
                    : 'border border-white/10 text-slate-400 hover:bg-white/5'
                }`}
              >
                {mode}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            {HORIZON_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => void setHorizonMonths(h)}
                className={`rounded-lg px-2 py-1 text-xs ${
                  preferences.horizonMonths === h
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'border border-white/10 text-slate-500 hover:bg-white/5'
                }`}
              >
                {formatMonths(h)}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={preferences.showBaselineComparison}
                onChange={(e) => void setShowBaselineComparison(e.target.checked)}
                className="rounded border-white/20 bg-slate-900"
              />
              Show minimum-payment baseline
            </label>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {preferences.viewMode === 'stacked' ? (
                <AreaChart data={chartData} margin={chartMargin}>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
                  <XAxis {...timelineXAxisProps(chartData[chartData.length - 1]?.month ?? 12)} />
                  <YAxis
                    stroke={chartColors.axis}
                    fontSize={11}
                    tickFormatter={formatTick}
                    tick={{ fill: chartColors.axis }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    labelFormatter={(month) => formatMonths(Number(month))}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="scheduled"
                    stackId="1"
                    stroke="#818cf8"
                    fill="#818cf8"
                    fillOpacity={0.5}
                    name="Scheduled principal"
                  />
                  <Area
                    type="monotone"
                    dataKey="extra"
                    stackId="1"
                    stroke="#34d399"
                    fill="#34d399"
                    fillOpacity={0.6}
                    name="Extra snowball"
                  />
                  {preferences.showBaselineComparison && (
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      dot={false}
                      name="Minimum payments"
                    />
                  )}
                </AreaChart>
              ) : (
                <AreaChart data={chartData} margin={chartMargin}>
                  <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
                  <XAxis {...timelineXAxisProps(chartData[chartData.length - 1]?.month ?? 12)} />
                  <YAxis
                    stroke={chartColors.axis}
                    fontSize={11}
                    tickFormatter={formatTick}
                    tick={{ fill: chartColors.axis }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    labelFormatter={(month) => formatMonths(Number(month))}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey={preferences.viewMode === 'cumulative' ? 'cumulative' : 'total'}
                    stroke="#a78bfa"
                    fill="#a78bfa"
                    fillOpacity={0.35}
                    name={
                      preferences.viewMode === 'cumulative'
                        ? 'Cumulative principal'
                        : 'Monthly principal'
                    }
                  />
                  {preferences.showBaselineComparison && (
                    <Line
                      type="monotone"
                      dataKey={
                        preferences.viewMode === 'cumulative'
                          ? 'baselineCumulative'
                          : 'baseline'
                      }
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      dot={false}
                      name="Minimum payments"
                    />
                  )}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-200">Principal by property (year 1)</p>
            <div className="space-y-2">
              {displayAnalysis.propertyShares.map((row) => {
                const isPinned = preferences.pinnedPropertyName === row.propertyName;
                const color = propertyColor(row.propertyName);
                return (
                  <button
                    key={row.propertyName}
                    type="button"
                    onClick={() =>
                      void setPinnedPropertyName(isPinned ? null : row.propertyName)
                    }
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      isPinned
                        ? 'border-violet-400/50 bg-violet-500/10'
                        : 'border-white/10 bg-slate-900/30 hover:border-white/20'
                    }`}
                  >
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-200">
                        {shortPropertyName(row.propertyName)}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.percentOfPortfolio)}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm tabular-nums text-slate-100">
                        {formatCurrency(row.principalYearToDate)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {row.percentOfPortfolio.toFixed(0)}% · pays off{' '}
                        {row.payoffMonth != null ? formatMonths(row.payoffMonth) : '—'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {saving && (
            <p className="text-center text-[10px] text-slate-600">Saving preferences…</p>
          )}
        </>
      )}
    </section>
  );
}
