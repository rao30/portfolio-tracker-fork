import { useMemo } from 'react';
import type { PropertyInsight, SimulationResult } from '../lib/types';
import { comparisonAtHorizons } from '../lib/snowball';
import {
  cashflowToneClass,
  formatCurrency,
  formatLtv,
  formatMonths,
  formatPercent,
} from '../lib/format';

interface PropertyInsightsProps {
  insights: PropertyInsight[];
  result: SimulationResult;
  stacked?: boolean;
  /** Calendar label for the selected portfolio year (e.g. "2026 (now)"). */
  yearLabel?: string;
  ownedCount?: number;
}

function dscrToneClass(dscr: number): string {
  if (!Number.isFinite(dscr)) return 'text-slate-400';
  if (dscr < 1) return 'text-red-400';
  if (dscr < 1.25) return 'text-amber-400';
  return 'text-emerald-400';
}

function cocToneClass(rate: number): string {
  if (rate > 0) return 'text-emerald-400';
  if (rate < 0) return 'text-red-400';
  return 'text-slate-400';
}

function CashflowValue({
  annual,
  monthly,
  size = 'md',
}: {
  annual: number;
  monthly: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tone = cashflowToneClass(annual);
  const annualSize =
    size === 'lg'
      ? 'text-lg font-semibold'
      : size === 'sm'
        ? 'text-sm font-medium'
        : 'text-base font-semibold';
  return (
    <div>
      <p className={`font-mono tabular-nums ${annualSize} ${tone}`}>
        {formatCurrency(annual)}
        <span className="ml-1 text-[10px] font-normal text-slate-500">/yr</span>
      </p>
      <p className={`font-mono text-[10px] tabular-nums ${tone} opacity-80`}>
        {formatCurrency(monthly)}/mo
      </p>
    </div>
  );
}

function rentalInsights(insights: PropertyInsight[]): PropertyInsight[] {
  return insights.filter((p) => !p.excludedFromRentalCashflow);
}

function InsightsSummary({ insights }: { insights: PropertyInsight[] }) {
  const rentals = rentalInsights(insights);
  const ownerOccupied = insights.filter((p) => p.excludedFromRentalCashflow);
  const totalAnnual = rentals.reduce((s, p) => s + p.cashflowAnnual, 0);
  const pocketAnnual = ownerOccupied.reduce((s, p) => s + p.cashflowAnnual, 0);
  const positive = rentals.filter((p) => p.cashflowAnnual > 0).length;
  const negative = rentals.filter((p) => p.cashflowAnnual < 0).length;
  const neutral = rentals.length - positive - negative;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Rental portfolio cashflow
          </p>
          <CashflowValue
            annual={totalAnnual}
            monthly={totalAnnual / 12}
            size="lg"
          />
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
            {positive} positive
          </span>
          {negative > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-400">
              {negative} negative
            </span>
          )}
          {neutral > 0 && (
            <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-slate-400">
              {neutral} break-even
            </span>
          )}
        </div>
      </div>
      {ownerOccupied.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-slate-400">
          <span className="text-amber-300/90">Out of pocket (owner-occupied, not in sum)</span>
          <CashflowValue annual={pocketAnnual} monthly={pocketAnnual / 12} size="sm" />
        </div>
      )}
    </div>
  );
}

export function PropertyInsights({
  insights,
  result,
  stacked = false,
  yearLabel,
  ownedCount,
}: PropertyInsightsProps) {
  const subtitle =
    yearLabel != null && ownedCount != null
      ? `${yearLabel} · ${ownedCount} propert${ownedCount === 1 ? 'y' : 'ies'} in service`
      : null;
  const horizons = comparisonAtHorizons(result, [60, 120, 180]);

  const sorted = useMemo(
    () =>
      [...insights].sort((a, b) => {
        if (a.excludedFromRentalCashflow !== b.excludedFromRentalCashflow) {
          return a.excludedFromRentalCashflow ? 1 : -1;
        }
        return b.cashflowAnnual - a.cashflowAnnual;
      }),
    [insights],
  );

  if (stacked) {
    return (
      <div className="app-surface divide-y divide-white/10">
        <section className="p-3">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">Per-property</h3>
          {subtitle && (
            <p className="mb-3 text-xs text-slate-500">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-3" />}
          <InsightsSummary insights={insights} />
          <ul className="space-y-3">
            {sorted.map((p) => (
              <li
                key={p.name}
                className={`rounded-lg border px-3 py-2.5 ${
                  p.excludedFromRentalCashflow
                    ? 'border-amber-500/25 bg-amber-500/5'
                    : p.cashflowAnnual < 0
                      ? 'border-red-500/20 bg-red-500/5'
                      : p.cashflowAnnual > 0
                        ? 'border-emerald-500/15 bg-emerald-500/5'
                        : 'border-white/10 bg-slate-900/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{p.name}</p>
                    {p.excludedFromRentalCashflow && (
                      <p className="text-[10px] text-amber-300/90">Owner-occupied</p>
                    )}
                  </div>
                  <CashflowValue
                    annual={p.cashflowAnnual}
                    monthly={p.cashflowMonthly}
                    size="sm"
                  />
                </div>
                {p.warnings.length > 0 && (
                  <p className="mt-1 text-[10px] text-amber-400">
                    {p.warnings.join('; ')}
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-slate-500">Equity</dt>
                    <dd className="font-mono tabular-nums text-cyan-300">
                      {formatCurrency(p.equity)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">LTV</dt>
                    <dd className="font-mono tabular-nums">{formatLtv(p.ltv)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">DSCR</dt>
                    <dd
                      className={`font-mono tabular-nums ${dscrToneClass(p.dscr)}`}
                    >
                      {Number.isFinite(p.dscr) ? p.dscr.toFixed(2) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">CoC</dt>
                    <dd
                      className={`font-mono tabular-nums ${cocToneClass(p.cashOnCash)}`}
                    >
                      {formatPercent(p.cashOnCash)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
        <section className="p-3">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Horizons</h3>
          <ul className="space-y-2 text-xs">
            {horizons.map((h) => (
              <li
                key={h.month}
                className="flex items-center justify-between gap-2 border-b border-white/5 py-2 last:border-0"
              >
                <span className="text-slate-400">{formatMonths(h.month)}</span>
                <span className="font-mono tabular-nums text-cyan-300">
                  {formatCurrency(h.equity)}
                </span>
                <span className="font-mono tabular-nums text-slate-300">
                  NW {formatCurrency(h.netWorth)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 pt-1 font-medium text-emerald-400">
              <span>Debt-free</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(result.finalEquity)}
              </span>
            </li>
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card overflow-x-auto p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">
          Per-property insights
        </h3>
        {subtitle && (
          <p className="mb-3 text-xs text-slate-500">{subtitle}</p>
        )}
        {!subtitle && <div className="mb-3" />}
        <InsightsSummary insights={insights} />
        <table className="w-full min-w-[880px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="pb-2 pr-3 font-medium">Property</th>
              <th className="pb-2 pr-3 font-medium">Cashflow</th>
              <th className="pb-2 pr-3 font-medium">Equity</th>
              <th className="pb-2 pr-3 font-medium">LTV</th>
              <th className="pb-2 pr-3 font-medium">DSCR</th>
              <th className="pb-2 pr-3 font-medium">CoC</th>
              <th className="pb-2 pr-3 font-medium">Cap rate</th>
              <th className="pb-2 pr-3 font-medium">Value</th>
              <th className="pb-2 font-medium">Payoff</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.name}
                className={`border-b border-white/5 text-slate-200 ${
                  p.excludedFromRentalCashflow
                    ? 'bg-amber-500/[0.06]'
                    : p.cashflowAnnual < 0
                      ? 'bg-red-500/[0.04]'
                      : p.warnings.length
                        ? 'bg-amber-500/5'
                        : ''
                }`}
              >
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-100">{p.name}</div>
                  {p.excludedFromRentalCashflow && (
                    <div className="text-[10px] text-amber-300/90">
                      Owner-occupied · out of pocket
                    </div>
                  )}
                  {p.warnings.length > 0 && (
                    <div className="mt-0.5 text-[10px] text-amber-400">
                      {p.warnings.join('; ')}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <CashflowValue
                    annual={p.cashflowAnnual}
                    monthly={p.cashflowMonthly}
                  />
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-cyan-300">
                  {formatCurrency(p.equity)}
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums">
                  {formatLtv(p.ltv)}
                </td>
                <td
                  className={`py-2.5 pr-3 font-mono tabular-nums ${dscrToneClass(p.dscr)}`}
                >
                  {Number.isFinite(p.dscr) ? p.dscr.toFixed(2) : '—'}
                </td>
                <td
                  className={`py-2.5 pr-3 font-mono tabular-nums ${cocToneClass(p.cashOnCash)}`}
                >
                  {formatPercent(p.cashOnCash)}
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
                  {formatPercent(p.capRate)}
                </td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
                  {formatCurrency(p.marketValue)}
                </td>
                <td className="py-2.5 font-mono tabular-nums text-slate-400">
                  {p.payoffRank ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 text-slate-300">
              <td className="py-2.5 pr-3 font-medium">Total</td>
              <td className="py-2.5 pr-3">
                <CashflowValue
                  annual={rentalInsights(insights).reduce(
                    (s, p) => s + p.cashflowAnnual,
                    0,
                  )}
                  monthly={
                    rentalInsights(insights).reduce(
                      (s, p) => s + p.cashflowAnnual,
                      0,
                    ) / 12
                  }
                />
              </td>
              <td className="py-2.5 pr-3 font-mono tabular-nums text-cyan-300">
                {formatCurrency(insights.reduce((s, p) => s + p.equity, 0))}
              </td>
              <td colSpan={6} className="py-2.5 text-[10px] text-slate-500">
                Rental portfolio only · owner-occupied excluded · after debt &amp;
                capex
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="glass-card overflow-x-auto p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Portfolio at horizons
        </h3>
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="pb-2 pr-2 font-medium">Horizon</th>
              <th className="pb-2 pr-2 font-medium">Equity</th>
              <th className="pb-2 pr-2 font-medium">Net worth</th>
              <th className="pb-2 font-medium">LTV</th>
            </tr>
          </thead>
          <tbody>
            {horizons.map((h) => (
              <tr key={h.month} className="border-b border-white/5 text-slate-200">
                <td className="py-2 pr-2">{formatMonths(h.month)}</td>
                <td className="py-2 pr-2 font-mono tabular-nums text-cyan-300">
                  {formatCurrency(h.equity)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatCurrency(h.netWorth)}
                </td>
                <td className="py-2 font-mono tabular-nums">{formatLtv(h.ltv)}</td>
              </tr>
            ))}
            <tr className="font-medium text-emerald-400">
              <td className="py-2 pr-2">
                Debt-free ({formatMonths(result.monthsToPayoff)})
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(result.finalEquity)}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(result.finalNetWorth)}
              </td>
              <td className="py-2 font-mono tabular-nums">0%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
