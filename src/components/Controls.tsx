import { STRATEGIES, STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import type { PortfolioSettingKey } from '../lib/usePortfolio';
import { formatCurrency, formatPercent } from '../lib/format';

interface ControlsProps {
  budget: number;
  budgetMax: number;
  strategy: StrategyId;
  annualRentGrowthRate: number;
  annualExpenseInflationRate: number;
  reinvestSurplus: boolean;
  monthlyReserveTarget: number;
  defaultVacancyRate: number;
  defaultCapexReserveRate: number;
  onBudgetChange: (value: number) => void;
  onStrategyChange: (value: StrategyId) => void;
  onPortfolioSettingChange: (
    field: PortfolioSettingKey,
    value: number | boolean,
  ) => void;
}

export function Controls({
  budget,
  budgetMax,
  strategy,
  annualRentGrowthRate,
  annualExpenseInflationRate,
  reinvestSurplus,
  monthlyReserveTarget,
  defaultVacancyRate,
  defaultCapexReserveRate,
  onBudgetChange,
  onStrategyChange,
  onPortfolioSettingChange,
}: ControlsProps) {
  return (
    <div className="glass-card grid gap-4 p-4 lg:grid-cols-2">
      <div>
        <label
          htmlFor="budget-slider"
          className="mb-2 block text-sm font-medium text-slate-300"
        >
          Extra monthly budget:{' '}
          <span className="font-mono tabular-nums text-cyan-300">
            {formatCurrency(budget)}
          </span>
        </label>
        <div className="flex items-center gap-3">
          <input
            id="budget-slider"
            type="range"
            min={0}
            max={budgetMax}
            step={100}
            value={budget}
            onChange={(e) => onBudgetChange(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-cyan-500"
          />
          <input
            type="number"
            min={0}
            max={budgetMax}
            step={100}
            value={budget}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onBudgetChange(Math.min(budgetMax, Math.max(0, v)));
            }}
            className="w-28 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm tabular-nums text-slate-100"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="strategy-select"
          className="mb-2 block text-sm font-medium text-slate-300"
        >
          Payoff strategy
        </label>
        <select
          id="strategy-select"
          value={strategy}
          onChange={(e) => onStrategyChange(e.target.value as StrategyId)}
          className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
        >
          {(Object.keys(STRATEGIES) as StrategyId[]).map((id) => (
            <option key={id} value={id}>
              {STRATEGY_LABELS[id]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
        <div>
          <label
            htmlFor="rent-growth"
            className="mb-1 block text-xs font-medium text-slate-400"
          >
            Rent growth (annual): {formatPercent(annualRentGrowthRate)}
          </label>
          <input
            id="rent-growth"
            type="range"
            min={0}
            max={0.08}
            step={0.005}
            value={annualRentGrowthRate}
            onChange={(e) =>
              onPortfolioSettingChange(
                'annualRentGrowthRate',
                Number(e.target.value),
              )
            }
            className="h-2 w-full cursor-pointer accent-cyan-500"
          />
        </div>
        <div>
          <label
            htmlFor="expense-inflation"
            className="mb-1 block text-xs font-medium text-slate-400"
          >
            Expense inflation (annual):{' '}
            {formatPercent(annualExpenseInflationRate)}
          </label>
          <input
            id="expense-inflation"
            type="range"
            min={0}
            max={0.08}
            step={0.005}
            value={annualExpenseInflationRate}
            onChange={(e) =>
              onPortfolioSettingChange(
                'annualExpenseInflationRate',
                Number(e.target.value),
              )
            }
            className="h-2 w-full cursor-pointer accent-cyan-500"
          />
        </div>
        <div>
          <label
            htmlFor="default-vacancy"
            className="mb-1 block text-xs font-medium text-slate-400"
          >
            Default vacancy: {formatPercent(defaultVacancyRate)}
          </label>
          <input
            id="default-vacancy"
            type="range"
            min={0}
            max={0.25}
            step={0.01}
            value={defaultVacancyRate}
            onChange={(e) =>
              onPortfolioSettingChange('defaultVacancyRate', Number(e.target.value))
            }
            className="h-2 w-full cursor-pointer accent-cyan-500"
          />
        </div>
        <div>
          <label
            htmlFor="default-capex"
            className="mb-1 block text-xs font-medium text-slate-400"
          >
            Capex reserve (% of gross rent): {formatPercent(defaultCapexReserveRate)}
          </label>
          <input
            id="default-capex"
            type="range"
            min={0}
            max={0.2}
            step={0.005}
            value={defaultCapexReserveRate}
            onChange={(e) =>
              onPortfolioSettingChange(
                'defaultCapexReserveRate',
                Number(e.target.value),
              )
            }
            className="h-2 w-full cursor-pointer accent-cyan-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="reinvest-surplus"
            type="checkbox"
            checked={reinvestSurplus}
            onChange={(e) =>
              onPortfolioSettingChange('reinvestSurplus', e.target.checked)
            }
            className="accent-cyan-500"
          />
          <label htmlFor="reinvest-surplus" className="text-xs text-slate-300">
            Reinvest surplus cashflow as extra principal
          </label>
        </div>
        <div>
          <label
            htmlFor="reserve-target"
            className="mb-1 block text-xs font-medium text-slate-400"
          >
            Monthly reserve target (kept in cash)
          </label>
          <input
            id="reserve-target"
            type="number"
            min={0}
            step={100}
            value={monthlyReserveTarget}
            onChange={(e) =>
              onPortfolioSettingChange(
                'monthlyReserveTarget',
                Math.max(0, Number(e.target.value) || 0),
              )
            }
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}
