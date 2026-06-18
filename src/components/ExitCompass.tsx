import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Portfolio } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  buildExitCompassAnalysis,
  computeExitCompassPreviewDelta,
  pathToneClass,
  preferencesToAssumptions,
  verdictLabel,
  verdictToneClass,
} from '../lib/exitCompass';
import type {
  ExitAnalysisMode,
  ExitPathMetrics,
  PropertyExitAnalysis,
} from '../lib/exitCompassTypes';
import { formatCurrency, formatPercent, propertyColor } from '../lib/format';
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

function verdictSummaryToneClass(tone: 'positive' | 'caution' | 'neutral'): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function AssumptionChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-xs tabular-nums text-slate-200">{value}</p>
    </div>
  );
}

function PathCard({ path }: { path: ExitPathMetrics }) {
  return (
    <div className={`rounded-xl border p-3 ${pathToneClass(path)}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {path.label}
        </p>
        {path.isRecommended && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-300">
            Best exit
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-medium text-slate-100">{path.headline}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{path.subline}</p>
      {path.taxLiability > 0 && (
        <p className="mt-2 font-mono text-[10px] tabular-nums text-rose-300/80">
          Tax: {formatCurrency(path.taxLiability)}
        </p>
      )}
    </div>
  );
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
  const sellPath = row.paths.find((p) => p.path === 'sell')!;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-orange-400/50 bg-orange-500/10 ring-1 ring-orange-400/20'
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
            ROE {formatPercent(row.returnOnEquity)}
          </p>
          <p className="mt-0.5 font-mono tabular-nums text-slate-500">
            Net {formatCurrency(sellPath.trueNetEquity)} · LTV {(row.ltv * 100).toFixed(0)}%
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{row.headline}</p>
    </button>
  );
}

function PropertyDetailPanel({
  row,
  showTaxBreakdown,
}: {
  row: PropertyExitAnalysis;
  showTaxBreakdown: boolean;
}) {
  const tax = row.taxBreakdown;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-slate-100">{row.propertyName}</p>
      <p className="mt-1 text-xs text-slate-400">
        Held {row.yearsHeld} yr · {formatCurrency(row.annualCashflow)}/yr cashflow
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {row.paths.map((path) => (
          <PathCard key={path.path} path={path} />
        ))}
      </div>

      {showTaxBreakdown && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-300">
            Exit tax breakdown
          </p>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <p className="text-slate-500">Gross sale</p>
              <p className="font-mono text-slate-200">{formatCurrency(tax.grossSalePrice)}</p>
            </div>
            <div>
              <p className="text-slate-500">Selling costs</p>
              <p className="font-mono text-slate-200">−{formatCurrency(tax.sellingCosts)}</p>
            </div>
            <div>
              <p className="text-slate-500">Loan payoff</p>
              <p className="font-mono text-slate-200">−{formatCurrency(tax.loanPayoff)}</p>
            </div>
            <div>
              <p className="text-slate-500">Accumulated depreciation</p>
              <p className="font-mono text-slate-200">{formatCurrency(tax.accumulatedDepreciation)}</p>
            </div>
            <div>
              <p className="text-slate-500">Depreciation recapture tax</p>
              <p className="font-mono text-rose-300">{formatCurrency(tax.recaptureTax)}</p>
            </div>
            <div>
              <p className="text-slate-500">Capital gains tax</p>
              <p className="font-mono text-rose-300">{formatCurrency(tax.capitalGainsTax)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-slate-500">Total tax liability</p>
              <p className="font-mono text-lg text-rose-200">{formatCurrency(tax.totalTax)}</p>
            </div>
          </div>
        </div>
      )}
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
    setProceedsToDebtPct,
    setShowTaxBreakdown,
  } = compassHook;

  const deferredPrefs = useDeferredValue(preferences);
  const assumptions = useMemo(
    () => preferencesToAssumptions(deferredPrefs),
    [deferredPrefs],
  );

  const analysis = useMemo(
    () =>
      buildExitCompassAnalysis(portfolio, activeStrategy, customOrder, assumptions),
    [portfolio, activeStrategy, customOrder, assumptions],
  );

  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);

  useEffect(() => {
    if (preferences.pinnedProperty) {
      setSelectedProperty(preferences.pinnedProperty);
    } else if (analysis.topExitCandidate) {
      setSelectedProperty(analysis.topExitCandidate);
    } else if (analysis.properties.length > 0) {
      setSelectedProperty(analysis.properties[0].propertyName);
    }
  }, [analysis.topExitCandidate, analysis.properties, preferences.pinnedProperty]);

  const selectedRow = analysis.properties.find((p) => p.propertyName === selectedProperty);

  const previewDelta = useMemo(() => {
    if (!selectedProperty) return null;
    return computeExitCompassPreviewDelta(
      portfolio,
      activeStrategy,
      customOrder,
      selectedProperty,
      assumptions,
    );
  }, [portfolio, activeStrategy, customOrder, selectedProperty, assumptions]);

  const handleSelectProperty = useCallback(
    (name: string) => {
      setSelectedProperty(name);
      void setPinnedProperty(name);
    },
    [setPinnedProperty],
  );

  const modeButtons: { id: ExitAnalysisMode; label: string }[] = [
    { id: 'all', label: 'All paths' },
    { id: 'hold', label: 'Hold' },
    { id: 'sell', label: 'Sell' },
    { id: 'exchange', label: '1031' },
  ];

  if (loading) {
    return (
      <div className={embedded ? '' : 'app-surface p-4'}>
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-48 rounded bg-white/10" />
          <div className="h-24 rounded-xl bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <section className={embedded ? '' : 'app-surface'}>
      <div className={embedded ? '' : 'p-4 sm:p-5'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                🧭
              </span>
              <h2 className="text-base font-semibold text-slate-100">Exit Compass</h2>
              {cloudBacked && (
                <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] uppercase text-cyan-400">
                  Synced
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Hold vs sell vs 1031 — after-tax net equity wired into your snowball payoff path
            </p>
          </div>
          {!embedded && (
            <button
              type="button"
              onClick={() => void setCollapsed(!preferences.isCollapsed)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              {preferences.isCollapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
        </div>

        {!preferences.isCollapsed && (
          <div className="mt-4 space-y-4">
            <div
              className={`rounded-xl border p-3 ${verdictSummaryToneClass(analysis.verdictTone)}`}
            >
              <p className="text-sm text-slate-200">{analysis.verdict}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                <span>{analysis.exitCount} exit candidates</span>
                <span>{analysis.holdCount} hold</span>
                <span>Portfolio tax exposure {formatCurrency(analysis.totalTaxExposure)}</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <AssumptionChip
                label="Sell timing"
                value={`Month ${preferences.sellAtMonth}`}
              />
              <AssumptionChip
                label="Closing costs"
                value={formatPercent(preferences.closingCostPct)}
              />
              <AssumptionChip
                label="Cap gains rate"
                value={formatPercent(preferences.capitalGainsRate)}
              />
              <AssumptionChip
                label="To snowball"
                value={formatPercent(preferences.proceedsToDebtPct)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">
                  Sell at month
                </label>
                <NumericInput
                  value={preferences.sellAtMonth}
                  onChange={(v) => void setSellAtMonth(Math.round(v ?? 12))}
                  min={1}
                  max={360}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">
                  Closing costs (%)
                </label>
                <NumericInput
                  value={preferences.closingCostPct * 100}
                  onChange={(v) => void setClosingCostPct((v ?? 6) / 100)}
                  min={0}
                  max={15}
                  allowDecimal
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">
                  Cap gains rate (%)
                </label>
                <NumericInput
                  value={preferences.capitalGainsRate * 100}
                  onChange={(v) => void setCapitalGainsRate((v ?? 15) / 100)}
                  min={0}
                  max={40}
                  allowDecimal
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">
                  Proceeds to debt (%)
                </label>
                <NumericInput
                  value={preferences.proceedsToDebtPct * 100}
                  onChange={(v) => void setProceedsToDebtPct((v ?? 100) / 100)}
                  min={0}
                  max={100}
                  allowDecimal
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {modeButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => void setAnalysisMode(btn.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] transition ${
                    preferences.analysisMode === btn.id
                      ? 'bg-orange-500/20 text-orange-200'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void setShowTaxBreakdown(!preferences.showTaxBreakdown)}
                className={`ml-auto rounded-lg px-2.5 py-1 text-[11px] transition ${
                  preferences.showTaxBreakdown
                    ? 'bg-white/10 text-slate-200'
                    : 'text-slate-500 hover:bg-white/5'
                }`}
              >
                Tax detail
              </button>
            </div>

            {previewDelta && previewDelta.monthsDelta > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs text-emerald-200">
                  Selling {shortPropertyName(previewDelta.propertyName)} at month{' '}
                  {preferences.sellAtMonth} accelerates debt-free by{' '}
                  <strong>{previewDelta.monthsDelta} months</strong> and saves{' '}
                  {formatCurrency(previewDelta.interestSaved)} in interest.
                </p>
                <p className="mt-1 text-[11px] text-emerald-300/70">
                  After-tax proceeds: {formatCurrency(previewDelta.afterTaxProceeds)} · 1031
                  deferred: {formatCurrency(previewDelta.exchangeProceeds)}
                </p>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                {analysis.properties.map((row) => (
                  <PropertyExitRow
                    key={row.propertyName}
                    row={row}
                    selected={row.propertyName === selectedProperty}
                    onSelect={() => handleSelectProperty(row.propertyName)}
                  />
                ))}
              </div>
              {selectedRow && (
                <PropertyDetailPanel
                  row={selectedRow}
                  showTaxBreakdown={preferences.showTaxBreakdown}
                />
              )}
            </div>

            {saving && (
              <p className="text-center text-[10px] text-slate-600">Saving preferences…</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
