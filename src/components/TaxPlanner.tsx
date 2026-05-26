import { useMemo, useState } from 'react';
import type { Portfolio, SimulationResult } from '../lib/types';
import {
  addTemplateAcquisitions,
  computeTaxPlannerResult,
  type TaxPlannerResult,
} from '../lib/tax';
import { runSimulation, type StrategyId } from '../lib/snowball';
import { formatCurrency, formatPercent } from '../lib/format';

interface TaxPlannerProps {
  portfolio: Portfolio;
  strategyId: StrategyId;
  onTaxProfileChange: (
    field: keyof Portfolio['taxProfile'],
    value: number | boolean | string,
  ) => void;
  onAcquisitionTemplateChange: (
    field: keyof Portfolio['acquisitionTemplate'],
    value: number | boolean | string,
  ) => void;
  onSimulateAcquisitions?: (count: number) => void;
}

function TaxBarChart({
  w2,
  usableLoss,
  remaining,
}: {
  w2: number;
  usableLoss: number;
  remaining: number;
}) {
  const total = w2 || 1;
  const lossPct = Math.min(100, (usableLoss / total) * 100);
  const remainPct = Math.min(100 - lossPct, (remaining / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {lossPct > 0 && (
          <div
            className="bg-emerald-500/80"
            style={{ width: `${lossPct}%` }}
            title="Offset by rental losses"
          />
        )}
        {remainPct > 0 && (
          <div
            className="bg-amber-500/80"
            style={{ width: `${remainPct}%` }}
            title="Remaining taxable income"
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span className="text-emerald-400">Loss offset</span>
        <span className="text-amber-400">Taxable remainder</span>
      </div>
    </div>
  );
}

export function TaxPlanner({
  portfolio,
  strategyId,
  onTaxProfileChange,
  onAcquisitionTemplateChange,
  onSimulateAcquisitions,
}: TaxPlannerProps) {
  const result: TaxPlannerResult = useMemo(
    () => computeTaxPlannerResult(portfolio),
    [portfolio],
  );

  const [simPreview, setSimPreview] = useState<SimulationResult | null>(null);

  const handleSimulate = () => {
    if (result.propertiesToBuy <= 0) return;
    const expanded = addTemplateAcquisitions(portfolio, result.propertiesToBuy);
    const sim = runSimulation(expanded, strategyId);
    setSimPreview(sim);
    onSimulateAcquisitions?.(result.propertiesToBuy);
  };

  const tp = portfolio.taxProfile;
  const tmpl = portfolio.acquisitionTemplate;

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">
          Tax & bonus depreciation planner
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Estimates only — not tax advice. Verify bonus depreciation rates and REPS
          qualification with your CPA.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label htmlFor="w2-income" className="mb-1 block text-xs text-slate-400">
                Annual W2 income (household)
              </label>
              <input
                id="w2-income"
                type="number"
                min={0}
                step={1000}
                value={tp.annualW2Income}
                onChange={(e) =>
                  onTaxProfileChange('annualW2Income', Number(e.target.value) || 0)
                }
                className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="spouse-reps"
                type="checkbox"
                checked={tp.spouseIsReps}
                onChange={(e) => onTaxProfileChange('spouseIsReps', e.target.checked)}
                className="accent-cyan-500"
              />
              <label htmlFor="spouse-reps" className="text-xs text-slate-300">
                Spouse is Real Estate Professional (REPS)
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="marginal-rate" className="mb-1 block text-xs text-slate-400">
                  Marginal tax rate
                </label>
                <input
                  id="marginal-rate"
                  type="number"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={tp.marginalTaxRate}
                  onChange={(e) =>
                    onTaxProfileChange('marginalTaxRate', Number(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="tax-year" className="mb-1 block text-xs text-slate-400">
                  Tax year
                </label>
                <input
                  id="tax-year"
                  type="number"
                  min={2020}
                  max={2035}
                  value={tp.taxYear}
                  onChange={(e) =>
                    onTaxProfileChange('taxYear', Number(e.target.value) || tp.taxYear)
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm text-slate-100"
                />
              </div>
            </div>
            <div>
              <label htmlFor="bonus-rate" className="mb-1 block text-xs text-slate-400">
                Bonus depreciation rate ({formatPercent(tp.bonusDepreciationRate)})
              </label>
              <input
                id="bonus-rate"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={tp.bonusDepreciationRate}
                onChange={(e) =>
                  onTaxProfileChange('bonusDepreciationRate', Number(e.target.value))
                }
                className="h-2 w-full accent-cyan-500"
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-400">Acquisition template</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Purchase price</label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={tmpl.purchasePrice}
                  onChange={(e) =>
                    onAcquisitionTemplateChange(
                      'purchasePrice',
                      Number(e.target.value) || 0,
                    )
                  }
                  className="w-full rounded border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Down payment %</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={tmpl.downPaymentPercent}
                  onChange={(e) =>
                    onAcquisitionTemplateChange(
                      'downPaymentPercent',
                      Number(e.target.value) || 0,
                    )
                  }
                  className="w-full rounded border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Monthly rent</label>
                <input
                  type="number"
                  min={0}
                  value={tmpl.monthlyRent}
                  onChange={(e) =>
                    onAcquisitionTemplateChange('monthlyRent', Number(e.target.value) || 0)
                  }
                  className="w-full rounded border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Monthly expenses</label>
                <input
                  type="number"
                  min={0}
                  value={tmpl.monthlyExpenses}
                  onChange={(e) =>
                    onAcquisitionTemplateChange(
                      'monthlyExpenses',
                      Number(e.target.value) || 0,
                    )
                  }
                  className="w-full rounded border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-xs text-slate-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="use-cost-seg"
                type="checkbox"
                checked={tmpl.useCostSeg}
                onChange={(e) =>
                  onAcquisitionTemplateChange('useCostSeg', e.target.checked)
                }
                className="accent-cyan-500"
              />
              <label htmlFor="use-cost-seg" className="text-xs text-slate-300">
                Cost segregation study ({formatPercent(tmpl.costSegPercent)} pool)
              </label>
            </div>
            {tmpl.useCostSeg && (
              <input
                type="range"
                min={0.1}
                max={0.35}
                step={0.01}
                value={tmpl.costSegPercent}
                onChange={(e) =>
                  onAcquisitionTemplateChange('costSegPercent', Number(e.target.value))
                }
                className="h-2 w-full accent-cyan-500"
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">Existing portfolio year-1 loss</p>
          <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
            {formatCurrency(result.totalExistingLoss)}
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">W2 remaining after existing</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber-400">
            {formatCurrency(result.remainingTaxableIncome)}
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">Properties to buy (template)</p>
          <p className="mt-1 font-mono text-lg font-semibold text-cyan-300">
            {result.propertiesToBuy} × {formatCurrency(tmpl.purchasePrice)}
          </p>
          <p className="text-xs text-slate-500">
            {formatCurrency(result.purchaseVolumeNeeded)} total volume
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-xs text-slate-400">Est. tax savings (full plan)</p>
          <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
            {formatCurrency(result.totalTaxSavings)}
          </p>
        </div>
      </div>

      <div className="glass-card p-4">
        <h4 className="mb-2 text-xs font-medium text-slate-400">Income vs loss offset</h4>
        <TaxBarChart
          w2={tp.annualW2Income}
          usableLoss={result.usableLoss}
          remaining={result.remainingTaxableIncome}
        />
        {!tp.spouseIsReps && (
          <p className="mt-2 text-xs text-amber-400">
            Without REPS: only {formatCurrency(result.withoutRepsUsableLoss)} usable this
            year; {formatCurrency(result.withoutRepsCarryforward)} carries forward.
          </p>
        )}
      </div>

      <div className="glass-card overflow-x-auto p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-200">
          Bonus depreciation strategies
        </h4>
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="pb-2 pr-2 font-medium">Strategy</th>
              <th className="pb-2 pr-2 font-medium">Loss / property</th>
              <th className="pb-2 pr-2 font-medium">Properties needed</th>
              <th className="pb-2 pr-2 font-medium">Purchase volume</th>
              <th className="pb-2 font-medium">Tax savings</th>
            </tr>
          </thead>
          <tbody>
            {result.strategies.map((s) => (
              <tr key={s.id} className="border-b border-white/5 text-slate-200">
                <td className="py-2 pr-2">{s.label}</td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatCurrency(s.lossPerProperty)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums">{s.propertiesNeeded}</td>
                <td className="py-2 pr-2 font-mono tabular-nums">
                  {formatCurrency(s.purchaseVolume)}
                </td>
                <td className="py-2 font-mono tabular-nums text-emerald-400">
                  {formatCurrency(s.taxSavings)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.propertiesToBuy > 0 && (
        <div className="glass-card flex flex-wrap items-center gap-3 p-4">
          <button
            type="button"
            onClick={handleSimulate}
            className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20"
          >
            Preview debt-free impact: add {result.propertiesToBuy} template properties
          </button>
          {simPreview && (
            <p className="text-xs text-slate-400">
              With acquisitions: debt-free in {simPreview.monthsToPayoff} months (
              {formatCurrency(simPreview.finalEquity)} equity)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
