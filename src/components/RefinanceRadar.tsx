import { useMemo } from 'react';
import type { Portfolio } from '../lib/types';
import { buildRefinanceRadarAnalysis } from '../lib/refinanceRadar';
import type {
  PropertyRefinanceAnalysis,
  RefinanceReadinessStatus,
} from '../lib/refinanceRadarTypes';
import { formatCurrency, formatMonths, formatPercent, propertyColor } from '../lib/format';
import type { UseRefinanceRadarResult } from '../lib/useRefinanceRadar';
import { NumericInput } from './NumericInput';

interface RefinanceRadarProps {
  portfolio: Portfolio;
  radarHook: UseRefinanceRadarResult;
  embedded?: boolean;
}

function statusToneClass(status: RefinanceReadinessStatus): string {
  if (status === 'ready' || status === 'cash_out_opportunity') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  }
  if (status === 'window_open' || status === 'rate_shock_risk') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }
  if (status === 'not_refinanceable' || status === 'cushion_tight') {
    return 'border-red-500/40 bg-red-500/10 text-red-200';
  }
  return 'border-white/10 bg-white/[0.02] text-slate-300';
}

function verdictToneClass(tone: 'positive' | 'caution' | 'neutral' | 'severe'): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'severe') return 'border-red-500/40 bg-red-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

function statusLabel(status: RefinanceReadinessStatus): string {
  switch (status) {
    case 'window_open':
      return 'Action window';
    case 'not_refinanceable':
      return 'Blocked';
    case 'cushion_tight':
      return 'Tight DSCR';
    case 'rate_shock_risk':
      return 'Rate shock risk';
    case 'cash_out_opportunity':
      return 'Cash-out window';
    case 'ready':
      return 'Refi-ready';
    default:
      return 'Conventional';
  }
}

function PropertyCard({
  row,
  pinned,
  onPin,
}: {
  row: PropertyRefinanceAnalysis;
  pinned: boolean;
  onPin: () => void;
}) {
  const color = propertyColor(row.propertyName);

  return (
    <article
      className={`rounded-xl border p-4 transition-colors ${
        pinned ? 'border-cyan-400/50 bg-cyan-500/5' : 'border-white/10 bg-slate-950/40'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <h4 className="truncate font-medium text-slate-100">{shortPropertyName(row.propertyName)}</h4>
          </div>
          <p className="mt-1 text-xs text-slate-400">{row.actionLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusToneClass(row.status)}`}
          >
            {statusLabel(row.status)}
          </span>
          <button
            type="button"
            onClick={onPin}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200"
          >
            {pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">DSCR at refi</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {Number.isFinite(row.dscrAtRefi) ? row.dscrAtRefi.toFixed(2) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Refi payment</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatCurrency(row.refiMonthlyPayment)}/mo
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Cash-out</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatCurrency(row.cashOutProceeds)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Balloon in</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {row.monthsUntilEvent != null ? formatMonths(row.monthsUntilEvent) : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-[11px]">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-1 pr-2 font-medium">Rate shock</th>
              <th className="pb-1 pr-2 font-medium">Payment</th>
              <th className="pb-1 font-medium">DSCR</th>
            </tr>
          </thead>
          <tbody>
            {row.rateShocks.map((shock) => (
              <tr key={shock.label} className={shock.passesMinDscr ? 'text-slate-300' : 'text-red-300'}>
                <td className="py-0.5 pr-2">{shock.label}</td>
                <td className="py-0.5 pr-2 font-mono tabular-nums">
                  {formatCurrency(shock.monthlyPayment)}
                </td>
                <td className="py-0.5 font-mono tabular-nums">
                  {Number.isFinite(shock.dscr) ? shock.dscr.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function RefinanceRadar({ portfolio, radarHook, embedded = false }: RefinanceRadarProps) {
  const { preferences, loading, saving, setCollapsed, setPinnedProperty, setAnalysisMode, setAssumptions } =
    radarHook;

  const analysis = useMemo(
    () =>
      buildRefinanceRadarAnalysis(
        portfolio,
        {
          marketRate: preferences.marketRate,
          closingCostPct: preferences.closingCostPct,
          holdPeriodMonths: preferences.holdPeriodMonths,
          cashOutLtv: preferences.cashOutLtv,
          minDscr: preferences.minDscr,
          deploymentYield: preferences.deploymentYield,
          refiTermMonths: preferences.refiTermMonths,
        },
        preferences.analysisMode,
        1,
      ),
    [portfolio, preferences],
  );

  const pinnedRow =
    preferences.pinnedProperty != null
      ? analysis.properties.find((p) => p.propertyName === preferences.pinnedProperty)
      : null;
  const displayRows = pinnedRow
    ? [pinnedRow, ...analysis.properties.filter((p) => p.propertyName !== pinnedRow.propertyName)]
    : analysis.properties;

  const shellClass = embedded
    ? 'app-surface p-4'
    : 'app-surface space-y-4 p-4 sm:p-5';

  if (loading) {
    return (
      <section className={shellClass} data-refinance-radar>
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-white/10" />
          <div className="h-24 rounded-xl bg-white/5" />
          <div className="h-24 rounded-xl bg-white/5" />
        </div>
      </section>
    );
  }

  return (
    <section className={shellClass} data-refinance-radar>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/80">
            Command Center
          </p>
          <h3 className="text-lg font-semibold text-slate-100">Refinance Radar</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            DSCR-at-refi modeling with rate shocks, cash-out capacity, and 12-month action windows —
            the gap CRE tools charge thousands for.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(!preferences.isCollapsed)}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-white/20"
        >
          {preferences.isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>

      {!preferences.isCollapsed && (
        <>
          <div className={`mt-4 rounded-xl border p-4 ${verdictToneClass(analysis.verdictTone)}`}>
            <p className="text-sm text-slate-100">{analysis.verdict}</p>
            <p className="mt-2 text-xs text-slate-400">
              {analysis.urgentCount} urgent · {analysis.opportunityCount} opportunities ·{' '}
              {formatCurrency(analysis.portfolioCashOutCapacity)} deployable cash-out capacity
              {saving ? ' · saving…' : ''}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['rate_term', 'cash_out', 'both'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void setAnalysisMode(mode)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  preferences.analysisMode === mode
                    ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                    : 'border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                {mode === 'rate_term' ? 'Rate & term' : mode === 'cash_out' ? 'Cash-out' : 'Both'}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-400">
              Market rate
              <NumericInput
                value={preferences.marketRate * 100}
                onChange={(v) => void setAssumptions({ marketRate: v / 100 })}
                min={1}
                max={20}
                step={0.125}
                suffix="%"
                className="mt-1"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Min DSCR
              <NumericInput
                value={preferences.minDscr}
                onChange={(v) => void setAssumptions({ minDscr: v })}
                min={0.5}
                max={2}
                step={0.05}
                className="mt-1"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Cash-out LTV
              <NumericInput
                value={preferences.cashOutLtv * 100}
                onChange={(v) => void setAssumptions({ cashOutLtv: v / 100 })}
                min={50}
                max={85}
                step={1}
                suffix="%"
                className="mt-1"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Deploy yield
              <NumericInput
                value={preferences.deploymentYield * 100}
                onChange={(v) => void setAssumptions({ deploymentYield: v / 100 })}
                min={0}
                max={50}
                step={0.5}
                suffix="%"
                className="mt-1"
              />
            </label>
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Closing costs {formatPercent(preferences.closingCostPct)} · Refi term{' '}
            {formatMonths(preferences.refiTermMonths)} · Hold {formatMonths(preferences.holdPeriodMonths)}
          </p>

          <div className="mt-4 space-y-3">
            {displayRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                No properties match this analysis mode. Add seller-financed loans or switch to cash-out.
              </p>
            ) : (
              displayRows.map((row) => (
                <PropertyCard
                  key={row.propertyName}
                  row={row}
                  pinned={preferences.pinnedProperty === row.propertyName}
                  onPin={() =>
                    void setPinnedProperty(
                      preferences.pinnedProperty === row.propertyName ? null : row.propertyName,
                    )
                  }
                />
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
