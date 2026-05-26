import { useMemo } from 'react';
import type { Portfolio, SimulationResult } from '../lib/types';
import {
  computePortfolioYearMetrics,
  maxPortfolioDashboardYear,
} from '../lib/snowball';
import { formatCurrency, formatLtv, formatPercent } from '../lib/format';

interface PortfolioDashboardProps {
  portfolio: Portfolio;
  result: SimulationResult;
  year: number;
  onYearChange: (year: number) => void;
  compact?: boolean;
}

function formatCoC(rate: number | null): string {
  if (rate == null) return '—';
  return formatPercent(rate);
}

function formatDscr(dscr: number | null): string {
  if (dscr == null || !Number.isFinite(dscr)) return '—';
  return dscr.toFixed(2);
}

export function PortfolioDashboard({
  portfolio,
  result,
  year,
  onYearChange,
  compact = false,
}: PortfolioDashboardProps) {
  const maxYear = useMemo(() => maxPortfolioDashboardYear(result), [result]);
  const metrics = useMemo(
    () => computePortfolioYearMetrics(portfolio, result, year),
    [portfolio, result, year],
  );

  if (!metrics) return null;

  const yearLabel =
    year === 1
      ? `${metrics.calendarYear} (now)`
      : String(metrics.calendarYear);

  const primary = [
    {
      label: 'Annual cashflow',
      value: formatCurrency(metrics.cashflowAnnual),
      sub: `${formatCurrency(metrics.cashflowAnnual / 12)}/mo after debt & capex`,
      highlight: metrics.cashflowAnnual >= 0,
      warn: metrics.cashflowAnnual < 0,
    },
    {
      label: 'Cash-on-cash',
      value: formatCoC(metrics.cashOnCash),
      sub:
        metrics.cashInvested > 0
          ? `${formatCurrency(metrics.cashInvested)} invested`
          : 'No cash in deal',
    },
    {
      label: 'NOI',
      value: formatCurrency(metrics.noiAnnual),
      sub: 'Before debt & capex',
    },
    {
      label: 'Cap rate',
      value: formatPercent(metrics.capRate),
      sub: 'NOI ÷ value',
    },
    {
      label: 'Portfolio DSCR',
      value: formatDscr(metrics.portfolioDscr),
      sub: 'NOI ÷ debt service',
      warn: metrics.portfolioDscr != null && metrics.portfolioDscr < 1,
    },
    {
      label: 'Equity',
      value: formatCurrency(metrics.equity),
      sub: `LTV ${formatLtv(metrics.ltv)} · ${metrics.ownedCount} properties`,
    },
  ];

  const secondary = [
    {
      label: 'Rent (collected)',
      value: formatCurrency(metrics.rentMonthly * 12),
    },
    {
      label: 'Debt service',
      value: formatCurrency(metrics.debtServiceAnnual),
    },
    {
      label: 'Capex reserve',
      value: formatCurrency(metrics.capexAnnual),
    },
    {
      label: 'Property value',
      value: formatCurrency(metrics.propertyValue),
    },
  ];

  return (
    <div className={compact ? 'app-surface space-y-3 p-4' : 'glass-card space-y-4 p-4'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Portfolio snapshot</h2>
          <p className="text-xs text-slate-500">
            Year {year} · {yearLabel} · annual run-rate at month {metrics.month}
          </p>
        </div>
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <label
            htmlFor="portfolio-year"
            className="mb-1 block text-xs font-medium text-slate-400"
          >
            Year
          </label>
          <input
            id="portfolio-year"
            type="range"
            min={1}
            max={maxYear}
            step={1}
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-cyan-500"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-500">
            <span>{portfolio.simulationAnchorYear ?? 2026}</span>
            <span>{(portfolio.simulationAnchorYear ?? 2026) + maxYear - 1}</span>
          </div>
        </div>
      </div>

      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-2 sm:grid-cols-3'
            : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
        }
      >
        {primary.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5"
          >
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p
              className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${
                item.warn
                  ? 'text-amber-400'
                  : item.highlight
                    ? 'text-emerald-400'
                    : 'text-white'
              }`}
            >
              {item.value}
            </p>
            {item.sub && (
              <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                {item.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-4">
        {secondary.map((item) => (
          <div key={item.label}>
            <p className="text-[10px] text-slate-500">{item.label}</p>
            <p className="font-mono text-sm tabular-nums text-slate-300">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
