import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../lib/types';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import { formatMonths } from '../lib/format';
import { ChartCard, chartColors, chartMargin } from './chart-theme';

interface StrategyComparisonProps {
  results: SimulationResult[];
  activeStrategy: StrategyId;
  onSelect: (strategy: StrategyId) => void;
}

export function StrategyComparison({
  results,
  activeStrategy,
  onSelect,
}: StrategyComparisonProps) {
  const extraOnly = results.filter((r) => r.strategy !== 'baseline');
  const data = extraOnly.map((r) => ({
    id: r.strategy as StrategyId,
    label:
      r.strategy in STRATEGY_LABELS
        ? STRATEGY_LABELS[r.strategy as StrategyId]
        : r.strategy,
    months: r.monthsToPayoff,
  }));

  return (
    <ChartCard title="Strategy comparison — months to payoff">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={chartMargin}>
          <XAxis type="number" stroke={chartColors.axis} fontSize={11} />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            stroke={chartColors.axis}
            fontSize={10}
            tick={{ fill: chartColors.axis }}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [formatMonths(value), 'Payoff']}
          />
          <Bar
            dataKey="months"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(d) => {
              const payload = d as { payload?: { id: StrategyId } };
              if (payload.payload?.id) onSelect(payload.payload.id);
            }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.id}
                fill={entry.id === activeStrategy ? '#22d3ee' : '#475569'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
