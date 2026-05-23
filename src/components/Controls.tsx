import { STRATEGIES, STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import { formatCurrency } from '../lib/format';

interface ControlsProps {
  budget: number;
  budgetMax: number;
  strategy: StrategyId;
  onBudgetChange: (value: number) => void;
  onStrategyChange: (value: StrategyId) => void;
}

export function Controls({
  budget,
  budgetMax,
  strategy,
  onBudgetChange,
  onStrategyChange,
}: ControlsProps) {
  return (
    <div className="glass-card grid gap-4 p-4 sm:grid-cols-2">
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
    </div>
  );
}
