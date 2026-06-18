import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ExpenseBreakdown, Portfolio, Property } from '../lib/types';
import {
  EXPENSE_LINE_META,
  EXPENSE_PRESET_HINTS,
  EXPENSE_PRESET_LABELS,
  analyzeOperatingCosts,
  breakdownsEqual,
  buildExpensePreset,
  computeOperatingCostsDelta,
  deltaToneClass,
  formatDeltaCurrency,
} from '../lib/operatingCosts';
import type { ExpensePresetId } from '../lib/operatingCostsTypes';
import { formatCurrency, formatPercent, propertyColor } from '../lib/format';
import type { UseOperatingCostsResult } from '../lib/useOperatingCosts';
import { NumericInput } from './NumericInput';

const PRESET_IDS: ExpensePresetId[] = [
  'lean_self_managed',
  'typical',
  'agency_managed',
  'from_market_value',
];

interface OperatingCostsCommandCenterProps {
  portfolio: Portfolio;
  property: Property;
  propertyIndex: number;
  propertyCount: number;
  costsHook: UseOperatingCostsResult;
  onApply: (breakdown: ExpenseBreakdown) => void;
  onFocusProperty?: (index: number) => void;
  embedded?: boolean;
}

function MetricCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        warn ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums text-slate-100">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function OperatingCostsCommandCenter({
  portfolio,
  property,
  propertyIndex,
  propertyCount,
  costsHook,
  onApply,
  onFocusProperty,
  embedded = false,
}: OperatingCostsCommandCenterProps) {
  const {
    preferences,
    saving,
    cloudBacked,
    setShowScheduleE,
    setLastExploredPreset,
  } = costsHook;

  const committed = property.expenseBreakdown ?? {};
  const [previewBreakdown, setPreviewBreakdown] = useState<ExpenseBreakdown>(committed);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreviewBreakdown(property.expenseBreakdown ?? {});
  }, [property.name, property.expenseBreakdown]);

  const deferredPreview = useDeferredValue(previewBreakdown);
  const isPreviewStale = previewBreakdown !== deferredPreview;
  const isDirty = !breakdownsEqual(committed, previewBreakdown);

  const committedAnalysis = useMemo(
    () => analyzeOperatingCosts(property, portfolio, committed),
    [property, portfolio, committed],
  );

  const previewAnalysis = useMemo(
    () => analyzeOperatingCosts(property, portfolio, deferredPreview),
    [property, portfolio, deferredPreview],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const delta = useMemo(
    () => computeOperatingCostsDelta(property, portfolio, committed, deferredPreview),
    [property, portfolio, committed, deferredPreview],
  );

  const setField = useCallback((key: keyof ExpenseBreakdown, val: number | undefined) => {
    setPreviewBreakdown((prev) => {
      const next = { ...prev, [key]: val };
      if (val == null) delete next[key];
      if (key === 'managementPercent' && val != null) delete next.management;
      if (key === 'management' && val != null) delete next.managementPercent;
      return next;
    });
  }, []);

  const applyPreset = useCallback(
    (preset: ExpensePresetId) => {
      const built = buildExpensePreset(preset, property, portfolio);
      setPreviewBreakdown(built);
      void setLastExploredPreset(preset);
    },
    [property, portfolio, setLastExploredPreset],
  );

  const handleApply = useCallback(() => {
    if (previewAnalysis.issues.length > 0) return;
    onApply(previewBreakdown);
  }, [onApply, previewAnalysis.issues.length, previewBreakdown]);

  const handleRevert = useCallback(() => {
    setPreviewBreakdown(committed);
  }, [committed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sectionRef.current?.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }
      if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleRevert();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isDirty) {
        e.preventDefault();
        handleApply();
      }
      if (onFocusProperty && propertyCount > 1) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          onFocusProperty(Math.min(propertyCount - 1, propertyIndex + 1));
        }
        if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          onFocusProperty(Math.max(0, propertyIndex - 1));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApply, handleRevert, isDirty, onFocusProperty, propertyCount, propertyIndex]);

  const shell = embedded
    ? 'rounded-lg border border-white/10 bg-slate-950/50'
    : 'glass-card';

  const visibleLines = EXPENSE_LINE_META.filter((meta) => {
    if (meta.key === 'management' && previewBreakdown.managementPercent != null) return false;
    return true;
  });

  const maxLineShare = Math.max(...analysis.lines.map((l) => l.monthlyAmount), 1);

  return (
    <div
      ref={sectionRef}
      className={shell}
      aria-label="Operating Costs Command Center"
    >
      <div className="border-b border-white/10 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: propertyColor(property.name) }}
              />
              <h3 className="truncate text-sm font-semibold text-white">
                Operating Costs Command Center
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {property.name} · Schedule E–mapped breakdown · live NOI preview
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            {cloudBacked ? (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                cloud sync
              </span>
            ) : (
              <span className="rounded bg-white/5 px-1.5 py-0.5">local prefs</span>
            )}
            {saving ? <span>syncing…</span> : null}
            <button
              type="button"
              onClick={() => void setShowScheduleE(!preferences.showScheduleE)}
              className={`rounded border px-2 py-0.5 transition ${
                preferences.showScheduleE
                  ? 'border-cyan-500/40 text-cyan-300'
                  : 'border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              Schedule E
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESET_IDS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              title={EXPENSE_PRESET_HINTS[preset]}
              className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                preferences.lastExploredPreset === preset
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              {EXPENSE_PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-5">
        <div className="space-y-3 sm:col-span-2 lg:col-span-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleLines.map((meta) => (
              <label key={meta.key} className="block">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">{meta.label}</span>
                  {preferences.showScheduleE ? (
                    <span className="shrink-0 rounded bg-white/5 px-1 py-0.5 font-mono text-[9px] text-slate-500">
                      E-{meta.scheduleELine}
                    </span>
                  ) : null}
                </div>
                <NumericInput
                  value={previewBreakdown[meta.key]}
                  onChange={(n) => setField(meta.key, n)}
                  optional
                  allowDecimal={meta.allowPercent ?? true}
                  min={0}
                  max={meta.allowPercent ? 1 : undefined}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                />
                {meta.hint ? (
                  <span className="mt-0.5 block text-[10px] text-slate-600">{meta.hint}</span>
                ) : null}
              </label>
            ))}
          </div>

          {analysis.issues.length > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {analysis.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Expense mix
            </p>
            {analysis.lines
              .filter((l) => l.monthlyAmount > 0)
              .map((line) => (
                <div key={line.key} className="flex items-center gap-2">
                  <span className="w-24 truncate text-[10px] text-slate-500">{line.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-cyan-500/60 transition-all"
                      style={{ width: `${(line.monthlyAmount / maxLineShare) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-mono text-[10px] tabular-nums text-slate-400">
                    {formatCurrency(line.monthlyAmount)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-3 sm:col-span-2 lg:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Operating / mo"
              value={formatCurrency(analysis.metrics.monthlyOperating)}
              sub={
                analysis.hasBreakdown
                  ? 'From breakdown'
                  : `Lump sum ${formatCurrency(analysis.lumpSumFallback)}`
              }
            />
            <MetricCard
              label="NOI / mo"
              value={formatCurrency(analysis.metrics.monthlyNoi)}
              warn={analysis.metrics.monthlyNoi < 0}
            />
            <MetricCard
              label="Cashflow / mo"
              value={formatCurrency(analysis.metrics.monthlyCashflow)}
              warn={analysis.metrics.monthlyCashflow < 0}
            />
            <MetricCard
              label="DSCR"
              value={
                analysis.metrics.dscr != null
                  ? analysis.metrics.dscr.toFixed(2)
                  : '—'
              }
              warn={analysis.metrics.dscr != null && analysis.metrics.dscr < 1}
            />
          </div>

          {isDirty ? (
            <div
              className={`rounded-lg border px-3 py-2 transition ${
                isPreviewStale ? 'border-white/5 opacity-60' : 'border-amber-400/40 bg-amber-500/10'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                Preview delta
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Operating</span>
                  <p className={`font-mono tabular-nums ${deltaToneClass(delta.monthlyOperatingDelta)}`}>
                    {formatDeltaCurrency(delta.monthlyOperatingDelta)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">NOI</span>
                  <p className={`font-mono tabular-nums ${deltaToneClass(delta.monthlyNoiDelta)}`}>
                    {formatDeltaCurrency(delta.monthlyNoiDelta)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Cashflow</span>
                  <p className={`font-mono tabular-nums ${deltaToneClass(delta.monthlyCashflowDelta)}`}>
                    {formatDeltaCurrency(delta.monthlyCashflowDelta)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">OER</span>
                  <p className="font-mono tabular-nums text-slate-300">
                    {analysis.metrics.operatingExpenseRatio != null
                      ? formatPercent(analysis.metrics.operatingExpenseRatio)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {preferences.showScheduleE && analysis.scheduleETotals.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Schedule E annual
              </p>
              <ul className="mt-2 space-y-1">
                {analysis.scheduleETotals.map((row) => (
                  <li
                    key={row.line}
                    className="flex items-center justify-between text-xs text-slate-300"
                  >
                    <span>
                      Line {row.line} · {row.label}
                    </span>
                    <span className="font-mono tabular-nums">{formatCurrency(row.annual)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {isDirty ? (
              <>
                <button
                  type="button"
                  onClick={handleRevert}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                >
                  Revert
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={previewAnalysis.issues.length > 0}
                  className="flex-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
                >
                  Apply to portfolio
                </button>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                Edit lines or pick a preset · ⌘↵ apply · Esc revert
                {propertyCount > 1 ? ' · j/k switch property' : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
