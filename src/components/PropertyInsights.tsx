import type { PropertyInsight, SimulationResult } from '../lib/types';
import { comparisonAtHorizons } from '../lib/snowball';
import { formatCurrency, formatLtv, formatMonths, formatPercent } from '../lib/format';

interface PropertyInsightsProps {
  insights: PropertyInsight[];
  result: SimulationResult;
}

export function PropertyInsights({ insights, result }: PropertyInsightsProps) {
  const horizons = comparisonAtHorizons(result, [60, 120, 180]);

  return (
    <div className="space-y-4">
      <div className="glass-card overflow-x-auto p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Per-property insights
        </h3>
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="pb-2 pr-2 font-medium">Property</th>
              <th className="pb-2 pr-2 font-medium">Value</th>
              <th className="pb-2 pr-2 font-medium">Equity</th>
              <th className="pb-2 pr-2 font-medium">LTV</th>
              <th className="pb-2 pr-2 font-medium">Cap rate</th>
              <th className="pb-2 pr-2 font-medium">DSCR</th>
              <th className="pb-2 pr-2 font-medium">CoC</th>
              <th className="pb-2 pr-2 font-medium">Break-even occ.</th>
              <th className="pb-2 pr-2 font-medium">Capex/mo</th>
              <th className="pb-2 font-medium">Payoff rank</th>
            </tr>
          </thead>
          <tbody>
            {insights.map((p) => (
              <tr
                key={p.name}
                className={`border-b border-white/5 text-slate-200 ${p.warnings.length ? 'bg-amber-500/5' : ''}`}
              >
                <td className="py-2 pr-2">
                  <div>{p.name}</div>
                  {p.warnings.length > 0 && (
                    <div className="text-[10px] text-amber-400">{p.warnings.join('; ')}</div>
                  )}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatCurrency(p.marketValue)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums text-cyan-300">
                  {formatCurrency(p.equity)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatLtv(p.ltv)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatPercent(p.capRate)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {Number.isFinite(p.dscr) ? p.dscr.toFixed(2) : '—'}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatPercent(p.cashOnCash)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatPercent(p.breakEvenOccupancy)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatCurrency(p.monthlyCapexReserve)}
                </td>
                <td className="py-2 font-mono tabular-nums">
                  {p.payoffRank ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
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
              <td className="py-2 pr-2">Debt-free ({formatMonths(result.monthsToPayoff)})</td>
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
