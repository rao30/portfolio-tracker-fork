import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Property, SimulationResult } from '../lib/types';
import { formatCurrency, propertyColor } from '../lib/format';
import {
  ChartCard,
  chartColors,
  chartMargin,
  timelineXAxisProps,
  yAxisLabel,
} from './chart-theme';

interface BalanceChartProps {
  result: SimulationResult;
  properties: Property[];
}

export function BalanceChart({ result, properties }: BalanceChartProps) {
  const data = result.history.map((h) => ({
    month: h.month,
    ...h.balancesByName,
  }));
  const maxMonth = result.history[result.history.length - 1]?.month ?? 1;

  return (
    <ChartCard title="Loan balances over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...timelineXAxisProps(maxMonth)} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            label={yAxisLabel('Loan balance')}
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
          {properties.map((p) => (
            <Area
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stackId="1"
              stroke={propertyColor(p.name)}
              fill={propertyColor(p.name)}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
