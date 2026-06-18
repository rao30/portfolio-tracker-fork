import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Portfolio } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  computeExitCompassAnalysis,
  computeExitPreviewDelta,
  preferencesToAssumptions,
  recommendationBadgeClass,
  recommendationLabel,
  verdictToneClass,
} from '../lib/exitCompass';
import type {
  ExitAnalysisMode,
  ExitCompassPreferences,
  PropertyExitAnalysis,
} from '../lib/exitCompassTypes';
import {
  formatCurrency,
  formatMonths,
  formatPercent,
  formatSimulationMonthLabel,
  propertyColor,
} from '../lib/format';
import type { UseExitCompassResult } from '../lib/useExitCompass';
import { NumericInput } from './NumericInput';

interface ExitCompassProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  customOrder?: string[] | null;
  compassHook: UseExitCompassResult;
  embedded?: boolean;
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

function PropertyExitRow({
  row,
  selected,
  onSelect,
}: {
  row: PropertyExitAnalysis;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = propertyColor(row.propertyName);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-amber-400/50 bg-amber-500/10 ring-1 ring-amber-400/20'
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
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${recommendationBadgeClass(row.recommendation)}`}
          >
            {recommendationLabel(row.recommendation)}
          </span>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono tabular-nums text-slate-300">
            {formatCurrency(row.equity)} equity
          </p>
          <p className="mt-0.5 font-mono tabular-nums text-slate-500">
            ROE {formatPercent(row.roe)} · score {row.keepScore}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{row.headline}</p>
      {row.snowballBoost.monthsSavedVsHold > 0 && (
        <p className="mt-1 text-[10px] font-medium text-emerald-400/90">
          Snowball: −{formatMonths(row.snowballBoost.monthsSavedVsHold)} to debt-free
        </p>
      )}
    </button>
  );
}

function PathComparisonTable({
  row,
  analysisMode,
  showTax,
}: {
  row: PropertyExitAnalysis;
  analysisMode: ExitAnalysisMode;
  showTax: boolean;
}) {
  const visiblePaths = row.paths.filter((p) => {
    if (analysisMode === 'all') return true;
    return p.pathId === analysisMode;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-3 font-semibold">Path</th>
            <th className="pb-2 pr-3 font-semibold">Wealth @ horizon</th>
            <th className="pb-2 pr-3 font-semibold">Debt-free</th>
            <th className="pb-2 pr-3 font-semibold">Net proceeds</th>
            {showTax && <th className="pb-2 font-semibold">Est. tax</th>}
          </tr>
        </thead>
        <tbody>
          {visiblePaths.map((path) => {
            const isWinner = path.pathId === row.winningPath;
            return (
              <tr
                key={path.pathId}
                className={`border-b border-white/5 ${isWinner ? 'bg-white/[0.03]' : ''}`}
              >
                <td className="py-2.5 pr-3">
                  <span
                    className={`font-medium ${isWinner ? 'text-amber-200' : 'text-slate-300'}`}
                  >
                    {path.label}
                    {isWinner && (
                      <span className="ml-1.5 text-[10px] text-emerald-400">★</span>
                    )}
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-200">
                  {formatCurrency(path.totalWealth)}
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
                  {formatMonths(path.monthsToDebtFree)}
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
                  {path.netProceeds != null ? formatCurrency(path.netProceeds) : '—'}
                </td>
                {showTax && (
                  <td className="py-2.5 font-mono tabular-nums text-slate-400">
                    {path.taxBreakdown ? formatCurrency(path.taxBreakdown.totalTax) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TaxBreakdownPanel({
  row,
}: {
  row: PropertyExitAnalysis;
}) {
  const sellPath = row.paths.find((p) => p.pathId === 'sell');
  const tax = sellPath?.taxBreakdown;
  if (!tax) return null;

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        True net equity (sell)
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-slate-500">Gross equity</p>
          <p className="font-mono text-slate-200">{formatCurrency(tax.grossEquity)}</p>
        </div>
        <div>
          <p className="text-slate-500">Closing costs</p>
          <p className="font-mono text-red-300/90">−{formatCurrency(tax.closingCosts)}</p>
        </div>
        <div>
          <p className="text-slate-500">Capital gains tax</p>
          <p className="font-mono text-red-300/90">−{formatCurrency(tax.capitalGainsTax)}</p>
        </div>
        <div>
          <p className="text-slate-500">Recapture tax</p>
          <p className="font-mono text-red-300/90">−{formatCurrency(tax.recaptureTax)}</p>
        </div>
        <div className="sm:col-span-2 border-t border-white/10 pt-2">
          <p className="text-slate-500">Net investable / to debt</p>
          <p className="font-mono text-lg text-emerald-300">{formatCurrency(tax.toDebt)}</p>
        </div>
      </div>
    </div>
  );
}

export function ExitCompass({
  portfolio,
  activeStrategy,
  customOrder,
  compassHook,
  embedded = false,
}: ExitCompassProps) {
  const {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setPinnedProperty,
    setAnalysisMode,
    setSellAtMonth,
    setClosingCostPct,
    setCapitalGainsRate,
    setRecaptureRate,
    setHoldHorizonMonths,
    setProceedsToDebtPct,
    setShowTaxBreakdown,
    persistPatch,
  } = compassHook;

  const committedPrefs = preferences;
  const [previewPrefs, setPreviewPrefs] = useState<ExitCompassPreferences>(committedPrefs);
  const [isScrubbing, setIsScrubbing] = useState(false);

  useEffect(() => {
    if (!isScrubbing) {
      setPreviewPrefs(committedPrefs);
    }
  }, [committedPrefs, isScrubbing]);

  const deferredPreview = useDeferredValue(previewPrefs);
  const isPreviewStale = previewPrefs !== deferredPreview;
  const isDirty = JSON.stringify(previewPrefs) !== JSON.stringify(committedPrefs);

  const committedAssumptions = useMemo(
    () => preferencesToAssumptions(committedPrefs),
    [committedPrefs],
  );

  const previewAssumptions = useMemo(
    () => preferencesToAssumptions(deferredPreview),
    [deferredPreview],
  );

  const committedAnalysis = useMemo(
    () =>
      computeExitCompassAnalysis(
        portfolio,
        activeStrategy,
        committedAssumptions,
        customOrder,
      ),
    [portfolio, activeStrategy, committedAssumptions, customOrder],
  );

  const previewAnalysis = useMemo(
    () =>
      computeExitCompassAnalysis(portfolio, activeStrategy, previewAssumptions, customOrder),
    [portfolio, activeStrategy, previewAssumptions, customOrder],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const selectedName =
    previewPrefs.pinnedProperty ??
    analysis.topExitCandidate?.propertyName ??
    analysis.properties[0]?.propertyName ??
    null;

  const selectedRow = analysis.properties.find((p) => p.propertyName === selectedName) ?? null;

  const previewDelta = useMemo(() => {
    if (!selectedName || previewPrefs.sellAtMonth === committedPrefs.sellAtMonth) {
      return null;
    }
    return computeExitPreviewDelta(
      portfolio,
      activeStrategy,
      selectedName,
      committedPrefs.sellAtMonth,
      previewPrefs.sellAtMonth,
      previewAssumptions,
      customOrder,
    );
  }, [
    portfolio,
    activeStrategy,
    selectedName,
    committedPrefs.sellAtMonth,
    previewPrefs.sellAtMonth,
    previewAssumptions,
    customOrder,
  ]);

  const handlePreviewPatch = useCallback((patch: Partial<ExitCompassPreferences>) => {
    setIsScrubbing(true);
    setPreviewPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCommit = useCallback(async () => {
    await persistPatch(previewPrefs);
    setIsScrubbing(false);
  }, [persistPatch, previewPrefs]);

  const handleDiscard = useCallback(() => {
    setPreviewPrefs(committedPrefs);
    setIsScrubbing(false);
  }, [committedPrefs]);

  const sellMonthLabel = formatSimulationMonthLabel(
    previewPrefs.sellAtMonth,
    portfolio,
  );

  const sectionClass = embedded
    ? 'app-surface overflow-hidden'
    : 'app-surface overflow-hidden shadow-lg shadow-black/20';

  if (loading) {
    return (
      <section className={sectionClass}>
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-5 w-48 rounded bg-white/10" />
          <div className="h-24 rounded-xl bg-white/5" />
          <div className="h-32 rounded-xl bg-white/5" />
        </div>
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              🧭
            </span>
            <h2 className="text-base font-semibold text-slate-100">Exit Compass</h2>
            {cloudBacked && (
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
                cloud
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Hold vs sell vs 1031 — wired into your snowball payoff path
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(!preferences.isCollapsed)}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
        >
          {preferences.isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>

      {!preferences.isCollapsed && (
        <div className="space-y-4 p-4">
          <div
            className={`rounded-xl border p-3 ${verdictToneClass(analysis.verdictTone)}`}
          >
            <p className="text-sm font-medium text-slate-100">{analysis.portfolioVerdict}</p>
            <p className="mt-1 text-xs text-slate-400">
              Baseline debt-free: {formatMonths(analysis.baselineMonthsToPayoff)} · horizon{' '}
              {formatMonths(previewPrefs.holdHorizonMonths)}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Portfolio exit ranking
              </p>
              {analysis.properties.length === 0 ? (
                <p className="text-sm text-slate-500">No properties to analyze.</p>
              ) : (
                analysis.properties.map((row) => (
                  <PropertyExitRow
                    key={row.propertyName}
                    row={row}
                    selected={row.propertyName === selectedName}
                    onSelect={() => void setPinnedProperty(row.propertyName)}
                  />
                ))
              )}
            </div>

            {selectedRow && (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-sm font-medium text-slate-100">{selectedRow.propertyName}</p>
                <p className="mt-1 text-xs text-slate-400">{selectedRow.subline}</p>

                <div className="mt-4">
                  <PathComparisonTable
                    row={selectedRow}
                    analysisMode={previewPrefs.analysisMode}
                    showTax={previewPrefs.showTaxBreakdown}
                  />
                </div>

                {previewPrefs.showTaxBreakdown && <TaxBreakdownPanel row={selectedRow} />}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                Assumptions
                {isDirty && (
                  <span className="ml-2 text-amber-400/80">preview</span>
                )}
                {isPreviewStale && (
                  <span className="ml-2 animate-pulse text-slate-500">calculating…</span>
                )}
              </p>
              {isDirty && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/5"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCommit()}
                    disabled={saving}
                    className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Apply assumptions'}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(['all', 'hold', 'sell', 'exchange'] as ExitAnalysisMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handlePreviewPatch({ analysisMode: mode })}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    previewPrefs.analysisMode === mode
                      ? 'bg-amber-500/25 text-amber-200'
                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {mode === 'exchange' ? '1031' : mode}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-400">Sell timing</label>
                  <span className="font-mono text-slate-200">{sellMonthLabel}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={120}
                  step={1}
                  value={previewPrefs.sellAtMonth}
                  onChange={(e) =>
                    handlePreviewPatch({ sellAtMonth: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-amber-500"
                />
                {previewDelta && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    vs committed: {previewDelta.wealthDelta >= 0 ? '+' : ''}
                    {formatCurrency(previewDelta.wealthDelta)} wealth ·{' '}
                    {previewDelta.monthsDelta >= 0 ? '+' : ''}
                    {formatMonths(Math.abs(previewDelta.monthsDelta))} debt-free
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <NumericInput
                  label="Closing %"
                  value={previewPrefs.closingCostPct * 100}
                  onChange={(v) =>
                    handlePreviewPatch({ closingCostPct: (v ?? 6) / 100 })
                  }
                  suffix="%"
                  min={0}
                  max={15}
                  step={0.5}
                />
                <NumericInput
                  label="Cap gains %"
                  value={previewPrefs.capitalGainsRate * 100}
                  onChange={(v) =>
                    handlePreviewPatch({ capitalGainsRate: (v ?? 15) / 100 })
                  }
                  suffix="%"
                  min={0}
                  max={40}
                  step={1}
                />
                <NumericInput
                  label="Recapture %"
                  value={previewPrefs.recaptureRate * 100}
                  onChange={(v) =>
                    handlePreviewPatch({ recaptureRate: (v ?? 25) / 100 })
                  }
                  suffix="%"
                  min={0}
                  max={35}
                  step={1}
                />
                <NumericInput
                  label="Proceeds to debt"
                  value={previewPrefs.proceedsToDebtPct * 100}
                  onChange={(v) =>
                    handlePreviewPatch({ proceedsToDebtPct: (v ?? 100) / 100 })
                  }
                  suffix="%"
                  min={0}
                  max={100}
                  step={5}
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <NumericInput
                  label="Hold horizon (mo)"
                  value={previewPrefs.holdHorizonMonths}
                  onChange={(v) =>
                    handlePreviewPatch({ holdHorizonMonths: v ?? 120 })
                  }
                  min={12}
                  max={360}
                  step={12}
                />
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={previewPrefs.showTaxBreakdown}
                    onChange={(e) =>
                      handlePreviewPatch({ showTaxBreakdown: e.target.checked })
                    }
                    className="rounded border-white/20 bg-slate-900 accent-amber-500"
                  />
                  Show tax breakdown
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
