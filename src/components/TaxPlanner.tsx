import { useMemo } from 'react';
import type { Portfolio } from '../lib/types';
import { computeTaxPlannerResult, type PropertyTaxLoss } from '../lib/tax';
import { formatCurrency, formatPercent } from '../lib/format';
import { NumericInput } from './NumericInput';

interface TaxPlannerProps {
  portfolio: Portfolio;
  onTaxProfileChange: (
    field: keyof Portfolio['taxProfile'],
    value: number | boolean | string,
  ) => void;
}

function TaxBarChart({
  w2,
  offset,
  remaining,
}: {
  w2: number;
  offset: number;
  remaining: number;
}) {
  const total = w2 || 1;
  const offsetPct = Math.min(100, (offset / total) * 100);
  const remainPct = Math.min(100 - offsetPct, (remaining / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {offsetPct > 0 && (
          <div className="bg-emerald-500/80" style={{ width: `${offsetPct}%` }} />
        )}
        {remainPct > 0 && (
          <div className="bg-amber-500/80" style={{ width: `${remainPct}%` }} />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span className="text-emerald-400">Shielded by rental losses</span>
        <span className="text-amber-400">Taxable remainder</span>
      </div>
    </div>
  );
}

function PropertyTaxTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: PropertyTaxLoss[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="glass-card overflow-x-auto p-4">
      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
      <p className="mb-3 text-xs text-slate-500">{subtitle}</p>
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="pb-2 pr-2 font-medium">Property</th>
            <th className="pb-2 pr-2 font-medium">Depreciation</th>
            <th className="pb-2 pr-2 font-medium">Bonus</th>
            <th className="pb-2 pr-2 font-medium">Interest</th>
            <th className="pb-2 pr-2 font-medium">Net rent</th>
            <th className="pb-2 font-medium">Tax loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name} className="border-b border-white/5 text-slate-200">
              <td className="py-2 pr-2">{p.name}</td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(p.depreciation.total)}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums text-cyan-300">
                {p.depreciation.bonus > 0
                  ? formatCurrency(p.depreciation.bonus)
                  : '—'}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(p.mortgageInterest)}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(p.grossRent - p.operatingExpenses - p.mortgageInterest)}
              </td>
              <td className="py-2 font-mono tabular-nums text-emerald-400">
                {formatCurrency(Math.max(0, p.netTaxableLoss))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TaxPlanner({ portfolio, onTaxProfileChange }: TaxPlannerProps) {
  const result = useMemo(() => computeTaxPlannerResult(portfolio), [portfolio]);
  const tp = portfolio.taxProfile;

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">
          {tp.taxYear} tax & depreciation planner
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Estimates for {tp.taxYear} only. Held properties use ongoing annual depreciation
          (bonus already taken). New {tp.taxYear} acquisitions get first-year bonus at{' '}
          {formatPercent(tp.bonusDepreciationRate)}. Not tax advice — verify with your CPA.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="w2-income" className="mb-1 block text-xs text-slate-400">
              Annual W2 income
            </label>
            <NumericInput
              id="w2-income"
              value={tp.annualW2Income}
              onChange={(v) => onTaxProfileChange('annualW2Income', v ?? 0)}
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="bonus-carryover" className="mb-1 block text-xs text-slate-400">
              Remaining bonus dep. carryover
            </label>
            <NumericInput
              id="bonus-carryover"
              value={tp.remainingBonusCarryover}
              onChange={(v) => onTaxProfileChange('remainingBonusCarryover', v ?? 0)}
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
            />
            <p className="mt-1 text-[10px] text-slate-500">Leftover from 2025 acquisitions</p>
          </div>
          <div>
            <label htmlFor="marginal-rate" className="mb-1 block text-xs text-slate-400">
              Marginal tax rate
            </label>
            <NumericInput
              id="marginal-rate"
              value={tp.marginalTaxRate}
              onChange={(v) => onTaxProfileChange('marginalTaxRate', v ?? 0)}
              min={0}
              max={0.5}
              allowDecimal
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-2 font-mono text-sm text-slate-100"
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={tp.spouseIsReps}
                onChange={(e) => onTaxProfileChange('spouseIsReps', e.target.checked)}
                className="accent-cyan-500"
              />
              Spouse is REPS
            </label>
            <p className="text-[10px] text-slate-500">
              Bonus rate: {formatPercent(tp.bonusDepreciationRate)} ({tp.taxYear})
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">Held properties loss</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-200">
            {formatCurrency(result.totalHeldLoss)}
          </p>
          <p className="text-[10px] text-slate-500">{result.heldProperties.length} properties</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">{tp.taxYear} acquisition loss</p>
          <p className="mt-1 font-mono text-lg font-semibold text-cyan-300">
            {formatCurrency(result.totalNewAcquisitionLoss)}
          </p>
          <p className="text-[10px] text-slate-500">
            {result.newAcquisitions.length} closing this year
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">Bonus carryover shield</p>
          <p className="mt-1 font-mono text-lg font-semibold text-cyan-300">
            {formatCurrency(result.remainingBonusCarryover)}
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">Total {tp.taxYear} tax shield</p>
          <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
            {formatCurrency(result.totalTaxLoss)}
          </p>
          <p className="text-[10px] text-slate-500">
            Depreciation {formatCurrency(result.totalDepreciation)}
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">W2 remaining / tax savings</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber-400">
            {formatCurrency(result.remainingTaxableIncome)}
          </p>
          <p className="text-[10px] text-emerald-400">
            Saves {formatCurrency(result.totalTaxSavings)}
          </p>
        </div>
      </div>

      <div className="glass-card p-4">
        <TaxBarChart
          w2={tp.annualW2Income}
          offset={result.usableLoss}
          remaining={result.remainingTaxableIncome}
        />
        {!tp.spouseIsReps && (
          <p className="mt-2 text-xs text-amber-400">
            Without REPS: only {formatCurrency(result.withoutRepsUsableLoss)} usable;
            {formatCurrency(result.withoutRepsCarryforward)} carries forward.
          </p>
        )}
        {result.carryforwardLoss > 0 && tp.spouseIsReps && (
          <p className="mt-2 text-xs text-slate-400">
            {formatCurrency(result.carryforwardLoss)} rental loss carries forward (exceeds
            W2).
          </p>
        )}
      </div>

      <PropertyTaxTable
        title={`Held before ${tp.taxYear}`}
        subtitle="Ongoing annual depreciation — bonus already taken in prior year"
        rows={result.heldProperties}
      />

      <PropertyTaxTable
        title={`Acquiring in ${tp.taxYear}`}
        subtitle={`First-year depreciation including ${formatPercent(tp.bonusDepreciationRate)} bonus on cost seg`}
        rows={result.newAcquisitions}
      />

      {result.excludedFuture.length > 0 && (
        <p className="text-xs text-slate-500">
          Excluded from {tp.taxYear} (future close): {result.excludedFuture.join(', ')}
        </p>
      )}
    </div>
  );
}
