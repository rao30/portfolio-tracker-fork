import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../lib/types';
import { formatCurrency } from '../lib/format';
import {
  ChartCard,
  chartColors,
  chartMargin,
  timelineXAxisProps,
  yAxisLabel,
} from './chart-theme';

interface InterestChartProps {
  active: SimulationResult;
  baseline: SimulationResult;
}

function cumulativeInterest(history: SimulationResult['history']) {
  let sum = 0;
  return history.map((h) => {
    sum += h.totalInterestThisMonth;
    return { month: h.month, cumulative: sum };
  });
}

export function InterestChart({ active, baseline }: InterestChartProps) {
  const activeCum = cumulativeInterest(active.history);
  const baselineCum = cumulativeInterest(baseline.history);
  const maxLen = Math.max(activeCum.length, baselineCum.length);
  const data = Array.from({ length: maxLen }, (_, i) => ({
    month: i + 1,
    active: activeCum[i]?.cumulative ?? null,
    baseline: baselineCum[i]?.cumulative ?? null,
  }));

  return (
    <ChartCard title="Cumulative interest — active vs baseline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...timelineXAxisProps(maxLen)} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            label={yAxisLabel('Cumulative interest')}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="active"
            name="Active strategy"
            stroke="#22d3ee"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline"
            stroke="#94a3b8"
            dot={false}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
