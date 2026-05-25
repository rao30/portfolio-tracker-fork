import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../lib/types';
import { formatMonths, propertyColor } from '../lib/format';
import {
  ChartCard,
  chartColors,
  chartMargin,
  monthScaleXAxisProps,
  yAxisLabel,
} from './chart-theme';

interface PayoffTimelineProps {
  result: SimulationResult;
}

export function PayoffTimeline({ result }: PayoffTimelineProps) {
  const data = Object.entries(result.payoffSchedule)
    .map(([name, month]) => ({ name, month }))
    .sort((a, b) => a.month - b.month);
  const maxMonth = Math.max(...data.map((d) => d.month), result.monthsToPayoff, 12);

  return (
    <ChartCard title="Payoff timeline">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...monthScaleXAxisProps(maxMonth, 'Payoff month')} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            stroke={chartColors.axis}
            fontSize={9}
            tick={{ fill: chartColors.axis }}
            label={yAxisLabel('Property')}
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
