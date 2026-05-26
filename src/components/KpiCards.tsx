import type { Portfolio, SimulationResult } from '../lib/types';
import {
  computePropertyInsights,
  currentPortfolioMetrics,
  snapshotAtMonth,
} from '../lib/snowball';
import { equityMultiple } from '../lib/analytics';
import { formatCurrency, formatLtv, formatMonths, formatPercent } from '../lib/format';

interface KpiCardsProps {
  active: SimulationResult;
  baseline: SimulationResult;
  portfolio: Portfolio;
  equityHorizon?: number;
  compact?: boolean;
}

export function KpiCards({
  active,
  baseline,
  portfolio,
  equityHorizon = 120,
  compact = false,
}: KpiCardsProps) {
  const interestSaved = baseline.totalInterestPaid - active.totalInterestPaid;
  const current = currentPortfolioMetrics(portfolio.properties);
  const horizonSnap = snapshotAtMonth(active, equityHorizon);
  const debtFreeSnap = active.history[active.history.length - 1];
  const insights = computePropertyInsights(portfolio, active.order);
  const worstDscr = insights.reduce(
    (min, p) => (Number.isFinite(p.dscr) && p.dscr < min ? p.dscr : min),
    Infinity,
  );
  const worstBreakEven = insights.reduce(
    (max, p) => (p.breakEvenOccupancy > max ? p.breakEvenOccupancy : max),
    0,
  );
  const initialEquity = current.totalEquity;
  const eqMult = equityMultiple(initialEquity, active);

  const items = [
    {
      label: 'Current equity',
      value: formatCurrency(current.totalEquity),
      sub: `LTV ${formatLtv(current.ltv)}`,
    },
    {
      label: 'Portfolio DSCR (worst)',
      value: Number.isFinite(worstDscr) ? worstDscr.toFixed(2) : '—',
      sub: worstDscr < 1 ? 'Below 1.0' : undefined,
      highlight: worstDscr < 1,
    },
    {
      label: 'Break-even occupancy (max)',
      value: formatPercent(worstBreakEven),
    },
    {
      label: 'Time to payoff',
      value: formatMonths(active.monthsToPayoff),
    },
    {
      label: `Equity at ${formatMonths(equityHorizon)}`,
      value: formatCurrency(horizonSnap?.totalEquity ?? 0),
    },
    {
      label: 'Equity multiple',
      value: eqMult.toFixed(2) + '×',
      sub: 'At debt-free vs today',
    },
    {
      label: 'Interest saved',
      value: formatCurrency(interestSaved),
      highlight: interestSaved > 0,
    },
    {
      label: 'Final cashflow',
      value: formatCurrency(active.finalMonthlyCashflow),
      sub: formatCurrency(debtFreeSnap?.netWorth ?? active.finalNetWorth) + ' net worth',
    },
  ];

  if (compact) {
    return (
      <div className="app-surface overflow-hidden">
        <div className="flex gap-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          {items.map((item, i) => (
            <div
              key={item.label}
              className={`min-w-[9.5rem] shrink-0 px-3 py-3 ${
                i > 0 ? 'border-l border-white/10' : ''
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p
                className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                  item.highlight ? 'text-emerald-400' : 'text-white'
                }`}
              >
                {item.value}
              </p>
              {item.sub && (
                <p className="mt-0.5 text-[10px] text-slate-500">{item.sub}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
      {items.map((item) => (
        <div key={item.label} className="glass-card p-3">
          <p className="text-xs text-slate-400">{item.label}</p>
          <p
            className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
              item.highlight ? 'text-emerald-400' : 'text-white'
            }`}
          >
            {item.value}
          </p>
          {item.sub && (
            <p className="mt-0.5 text-xs text-slate-500">{item.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
