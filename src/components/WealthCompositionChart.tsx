import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../lib/types';
import { formatCurrency, formatCurrencyCompact, formatMonths } from '../lib/format';
import {
  ChartCard,
  chartColors,
  chartMargin,
  timelineXAxisProps,
  yAxisLabel,
} from './chart-theme';

interface WealthCompositionChartProps {
  result: SimulationResult;
}

export function WealthCompositionChart({ result }: WealthCompositionChartProps) {
  const data = result.history.map((h) => ({
    month: h.month,
    equity: h.totalEquity,
    cash: h.cashReserveBalance,
  }));

  const maxMonth = result.history[result.history.length - 1]?.month ?? 1;

  return (
    <ChartCard title="Wealth composition (equity + cash)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...timelineXAxisProps(maxMonth)} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={formatCurrencyCompact}
            label={yAxisLabel('Wealth')}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'equity' ? 'Real estate equity' : 'Cash reserves',
            ]}
            labelFormatter={(month) => formatMonths(Number(month))}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stackId="1"
            stroke="#a78bfa"
            fill="#a78bfa"
            fillOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="cash"
            stackId="1"
            stroke="#34d399"
            fill="#34d399"
            fillOpacity={0.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
