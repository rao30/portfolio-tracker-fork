import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Portfolio } from '../lib/types';
import {
  buildRefinanceRadarAnalysis,
  preferencesToAssumptions,
  verdictLabel,
  verdictToneClass,
} from '../lib/refinanceRadar';
import type {
  PropertyRefinanceOpportunity,
  RefinanceAnalysisMode,
  RefinanceRadarPreferences,
} from '../lib/refinanceRadarTypes';
import { formatCurrency, formatPercent, propertyColor } from '../lib/format';
import type { UseRefinanceRadarResult } from '../lib/useRefinanceRadar';
import { NumericInput } from './NumericInput';

interface RefinanceRadarProps {
  portfolio: Portfolio;
  radarHook: UseRefinanceRadarResult;
  embedded?: boolean;
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

function verdictSummaryToneClass(tone: 'positive' | 'caution' | 'neutral'): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function AssumptionChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-xs tabular-nums text-slate-200">{value}</p>
    </div>
  );
}

function PropertyRadarRow({
  row,
  selected,
  analysisMode,
  onSelect,
}: {
  row: PropertyRefinanceOpportunity;
  selected: boolean;
  analysisMode: RefinanceAnalysisMode;
  onSelect: () => void;
}) {
  const color = propertyColor(row.propertyName);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-violet-400/50 bg-violet-500/10 ring-1 ring-violet-400/20'
          : 'border-white/10 bg-slate-900/40 hover:border-white/20'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <p className="text-sm font-medium text-slate-100" title={row.propertyName}>
              {shortPropertyName(row.propertyName)}
            </p>
          </div>
          <span
            className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${verdictToneClass(row.primaryVerdict)}`}
          >
            {verdictLabel(row.primaryVerdict)}
          </span>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono tabular-nums text-slate-300">
            {formatPercent(row.currentRate)} · {formatCurrency(row.currentPayment)}/mo
          </p>
          <p className="mt-0.5 font-mono tabular-nums text-slate-500">
            LTV {(row.ltv * 100).toFixed(0)}% · DSCR {Number.isFinite(row.currentDscr) ? row.currentDscr.toFixed(2) : '—'}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">{row.headline}</p>

      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
        {(analysisMode === 'rate_term' || analysisMode === 'both') && (
          <>
            <div>
              <p className="text-slate-500">Rate-term savings</p>
              <p className="font-mono tabular-nums text-slate-200">
                {row.monthlySavings != null && row.monthlySavings > 0
                  ? `${formatCurrency(row.monthlySavings)}/mo`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Break-even</p>
              <p className="font-mono tabular-nums text-slate-200">
                {row.breakEvenMonths != null ? `${row.breakEvenMonths} mo` : '—'}
              </p>
            </div>
          </>
        )}
        {(analysisMode === 'cash_out' || analysisMode === 'both') && (
          <div>
            <p className="text-slate-500">Net cash-out</p>
            <p className="font-mono tabular-nums text-slate-200">
              {row.cashOutNet != null ? formatCurrency(row.cashOutNet) : '—'}
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

function PropertyDetailPanel({
  row,
  analysisMode,
}: {
  row: PropertyRefinanceOpportunity;
  analysisMode: RefinanceAnalysisMode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-slate-100">{row.propertyName}</p>
      <p className="mt-1 text-xs text-slate-400">{row.headline}</p>

      {(analysisMode === 'rate_term' || analysisMode === 'both') && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            Rate &amp; term
          </p>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <p className="text-slate-500">New P&I</p>
              <p className="font-mono text-slate-200">
                {row.rateTermNewPayment != null
                  ? `${formatCurrency(row.rateTermNewPayment)}/mo`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Closing costs</p>
              <p className="font-mono text-slate-200">{formatCurrency(row.closingCosts)}</p>
            </div>
            <div>
              <p className="text-slate-500">Hold-period net</p>
              <p className="font-mono text-slate-200">
                {row.holdPeriodNetBenefit != null
                  ? formatCurrency(row.holdPeriodNetBenefit)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Verdict</p>
              <p className="text-slate-200">{row.rateTermRationale}</p>
            </div>
          </div>
        </div>
      )}

      {(analysisMode === 'cash_out' || analysisMode === 'both') && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            Cash-out
          </p>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <p className="text-slate-500">Max loan</p>
              <p className="font-mono text-slate-200">
                {row.maxLoanAmount != null ? formatCurrency(row.maxLoanAmount) : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Post-refi DSCR</p>
              <p className="font-mono text-slate-200">
                {row.cashOutDscr != null ? row.cashOutDscr.toFixed(2) : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Payment delta</p>
              <p className="font-mono text-slate-200">
                {row.cashOutMonthlyDelta != null
                  ? `${row.cashOutMonthlyDelta >= 0 ? '+' : ''}${formatCurrency(row.cashOutMonthlyDelta)}/mo`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Verdict</p>
              <p className="text-slate-200">{row.cashOutRationale}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RefinanceRadar({
  portfolio,
  radarHook,
  embedded = false,
}: RefinanceRadarProps) {
  const { preferences, setCollapsed, setPinnedProperty, applyAssumptions, saving } = radarHook;

  const committedPrefs = preferences;
  const [previewPrefs, setPreviewPrefs] = useState<RefinanceRadarPreferences>(committedPrefs);

  useEffect(() => {
    setPreviewPrefs(committedPrefs);
  }, [committedPrefs]);

  const deferredPreview = useDeferredValue(previewPrefs);
  const isPreviewStale = previewPrefs !== deferredPreview;
  const isDirty = JSON.stringify(previewPrefs) !== JSON.stringify(committedPrefs);

  const committedAnalysis = useMemo(
    () =>
      buildRefinanceRadarAnalysis(
        portfolio,
        preferencesToAssumptions(committedPrefs),
      ),
    [portfolio, committedPrefs],
  );

  const previewAnalysis = useMemo(
    () =>
      buildRefinanceRadarAnalysis(
        portfolio,
        preferencesToAssumptions(deferredPreview),
      ),
    [portfolio, deferredPreview],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const pinned =
    (preferences.pinnedProperty != null
      ? analysis.properties.find((p) => p.propertyName === preferences.pinnedProperty)
      : analysis.properties[0]) ?? analysis.properties[0];

  const handlePreviewPatch = useCallback((patch: Partial<RefinanceRadarPreferences>) => {
    setPreviewPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleApply = useCallback(() => {
    void applyAssumptions({
      analysisMode: previewPrefs.analysisMode,
      marketRate: previewPrefs.marketRate,
      closingCostPct: previewPrefs.closingCostPct,
      holdPeriodMonths: previewPrefs.holdPeriodMonths,
      cashOutLtv: previewPrefs.cashOutLtv,
      minDscr: previewPrefs.minDscr,
      deploymentYield: previewPrefs.deploymentYield,
      refiTermMonths: previewPrefs.refiTermMonths,
    });
  }, [applyAssumptions, previewPrefs]);

  const shell = embedded ? 'space-y-4' : 'glass-card overflow-hidden border-violet-500/20';

  if (analysis.eligibleCount === 0) {
    return null;
  }

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
              Refinance Opportunities
            </p>
            <p className="truncate text-sm text-slate-200">{analysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            {analysis.strongCount > 0 ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                {analysis.strongCount} strong
              </span>
            ) : (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
                Scanning {analysis.eligibleCount}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  }

  return (
    <section className={shell}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
            Refinance Opportunities
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Checks every loan for a worthwhile refinance — monthly savings, break-even time, and cash-out potential.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(true)}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/5"
        >
          Collapse
        </button>
      </header>

      <div className="space-y-4 p-4">
        <div
          className={`rounded-xl border p-4 ${verdictSummaryToneClass(analysis.verdictTone)} ${isPreviewStale ? 'opacity-70' : ''}`}
        >
          <p className="text-sm text-slate-100">{analysis.verdict}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AssumptionChip
              label="Market rate"
              value={formatPercent(deferredPreview.marketRate)}
            />
            <AssumptionChip
              label="Closing"
              value={formatPercent(deferredPreview.closingCostPct)}
            />
            <AssumptionChip
              label="Hold"
              value={`${deferredPreview.holdPeriodMonths} mo`}
            />
            <AssumptionChip
              label="Cash-out LTV"
              value={formatPercent(deferredPreview.cashOutLtv)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Assumptions
            </p>
            <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
              {(['both', 'rate_term', 'cash_out'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handlePreviewPatch({ analysisMode: mode })}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                    previewPrefs.analysisMode === mode
                      ? 'bg-violet-500/30 text-violet-100'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {mode === 'rate_term' ? 'Rate-term' : mode === 'cash_out' ? 'Cash-out' : 'Both'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Market rate (%)</span>
              <NumericInput
                value={previewPrefs.marketRate * 100}
                onChange={(v) => handlePreviewPatch({ marketRate: (v ?? 7) / 100 })}
                min={1}
                max={20}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Closing costs (%)</span>
              <NumericInput
                value={previewPrefs.closingCostPct * 100}
                onChange={(v) => handlePreviewPatch({ closingCostPct: (v ?? 2.5) / 100 })}
                min={0}
                max={10}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Hold period (mo)</span>
              <NumericInput
                value={previewPrefs.holdPeriodMonths}
                onChange={(v) => handlePreviewPatch({ holdPeriodMonths: Math.round(v ?? 60) })}
                min={12}
                max={360}
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Cash-out LTV cap (%)</span>
              <NumericInput
                value={previewPrefs.cashOutLtv * 100}
                onChange={(v) => handlePreviewPatch({ cashOutLtv: (v ?? 75) / 100 })}
                min={50}
                max={85}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Min DSCR</span>
              <NumericInput
                value={previewPrefs.minDscr}
                onChange={(v) => handlePreviewPatch({ minDscr: v ?? 1 })}
                min={0.5}
                max={2}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Deploy yield (%)</span>
              <NumericInput
                value={previewPrefs.deploymentYield * 100}
                onChange={(v) => handlePreviewPatch({ deploymentYield: (v ?? 12) / 100 })}
                min={0}
                max={50}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-500">Refi term (mo)</span>
              <NumericInput
                value={previewPrefs.refiTermMonths}
                onChange={(v) => handlePreviewPatch({ refiTermMonths: Math.round(v ?? 360) })}
                min={60}
                max={480}
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
              />
            </label>
          </div>

          {isDirty && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
              <p className="text-xs text-violet-100">Previewing new assumptions — apply to commit.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewPrefs(committedPrefs)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleApply}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Apply assumptions'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            {analysis.properties.map((row) => (
              <PropertyRadarRow
                key={row.propertyName}
                row={row}
                selected={pinned?.propertyName === row.propertyName}
                analysisMode={deferredPreview.analysisMode}
                onSelect={() => void setPinnedProperty(row.propertyName)}
              />
            ))}
          </div>
          {pinned ? (
            <PropertyDetailPanel row={pinned} analysisMode={deferredPreview.analysisMode} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
