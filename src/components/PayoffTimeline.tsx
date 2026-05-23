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
import { formatMonths, propertyColor } from '../lib/format';
import { ChartCard, chartColors, chartMargin } from './chart-theme';

interface PayoffTimelineProps {
  result: SimulationResult;
}

export function PayoffTimeline({ result }: PayoffTimelineProps) {
  const data = Object.entries(result.payoffSchedule)
    .map(([name, month]) => ({ name, month }))
    .sort((a, b) => a.month - b.month);

  return (
    <ChartCard title="Payoff timeline">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={chartMargin}>
          <XAxis type="number" stroke={chartColors.axis} fontSize={11} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            stroke={chartColors.axis}
            fontSize={9}
            tick={{ fill: chartColors.axis }}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [formatMonths(value), 'Paid off']}
          />
          <Bar dataKey="month" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={propertyColor(entry.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
