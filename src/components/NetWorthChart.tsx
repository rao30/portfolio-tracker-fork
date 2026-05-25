import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
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

interface NetWorthChartProps {
  result: SimulationResult;
  baseline?: SimulationResult | null;
}

export function NetWorthChart({ result, baseline }: NetWorthChartProps) {
  const data = result.history.map((h) => ({
    month: h.month,
    equity: h.totalEquity,
    cash: h.cashReserveBalance,
    netWorth: h.netWorth,
    baselineNetWorth: baseline
      ? baseline.history.find((b) => b.month === h.month)?.netWorth
      : undefined,
  }));

  const maxMonth = result.history[result.history.length - 1]?.month ?? 1;
  const debtFreeMonth = result.monthsToPayoff;

  return (
    <ChartCard title="Net worth over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...timelineXAxisProps(maxMonth)} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={formatCurrencyCompact}
            label={yAxisLabel('Net worth')}
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
              name === 'equity'
                ? 'Equity'
                : name === 'cash'
                  ? 'Cash reserves'
                  : 'Net worth',
            ]}
            labelFormatter={(month) => formatMonths(Number(month))}
          />
          <ReferenceLine
            x={debtFreeMonth}
            stroke="#34d399"
            strokeDasharray="4 4"
            label={{
              value: 'Debt-free',
              fill: '#34d399',
              fontSize: 10,
              position: 'insideTopLeft',
            }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stackId="nw"
            stroke="#22d3ee"
            fill="#22d3ee"
            fillOpacity={0.5}
          />
          <Area
            type="monotone"
            dataKey="cash"
            stackId="nw"
            stroke="#34d399"
            fill="#34d399"
            fillOpacity={0.4}
          />
          {baseline && (
            <Line
              type="monotone"
              dataKey="baselineNetWorth"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
