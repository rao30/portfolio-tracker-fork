import type { SimulationResult } from '../lib/types';
import { formatCurrency, formatMonths } from '../lib/format';

interface KpiCardsProps {
  active: SimulationResult;
  baseline: SimulationResult;
}

export function KpiCards({ active, baseline }: KpiCardsProps) {
  const interestSaved = baseline.totalInterestPaid - active.totalInterestPaid;

  const items = [
    {
      label: 'Time to payoff',
      value: formatMonths(active.monthsToPayoff),
    },
    {
      label: 'Total interest',
      value: formatCurrency(active.totalInterestPaid),
    },
    {
      label: 'Interest saved vs baseline',
      value: formatCurrency(interestSaved),
      highlight: interestSaved > 0,
    },
    {
      label: 'Extra principal paid',
      value: formatCurrency(active.totalExtraPaid),
    },
    {
      label: 'Final monthly cashflow',
      value: formatCurrency(active.finalMonthlyCashflow),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
        </div>
      ))}
    </div>
  );
}
