import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../lib/types';
import { formatCurrency, formatMonths } from '../lib/format';
import {
  ChartCard,
  chartColors,
  chartMargin,
  timelineXAxisProps,
  yAxisLabel,
} from './chart-theme';

interface CashflowChartProps {
  result: SimulationResult;
}

function formatCashflowTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value}`;
}

export function CashflowChart({ result }: CashflowChartProps) {
  const historyPoints = result.history.map((h) => ({
    month: h.month,
    cashflow: h.monthlyCashflow,
  }));

  const lastMonth = historyPoints[historyPoints.length - 1]?.month ?? 0;
  // Extend one month so step-after shows the final plateau clearly
  const data = [
    ...historyPoints,
    { month: lastMonth + 1, cashflow: result.finalMonthlyCashflow },
  ];

  const cashflows = data.map((d) => d.cashflow);
  const yMin = Math.min(...cashflows, result.finalMonthlyCashflow);
  const yMax = Math.max(...cashflows, result.finalMonthlyCashflow);
  const yPadding = Math.max(500, (yMax - yMin) * 0.08);

  return (
    <ChartCard title="Monthly cashflow (grows as loans pay off)">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...timelineXAxisProps(lastMonth + 1)} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={formatCashflowTick}
            domain={[yMin - yPadding, yMax + yPadding]}
            label={yAxisLabel('Monthly cashflow')}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [formatCurrency(value), 'Cashflow']}
            labelFormatter={(month) => formatMonths(Number(month))}
          />
          <ReferenceLine
            y={result.finalMonthlyCashflow}
            stroke="#34d399"
            strokeDasharray="6 4"
            label={{
              value: `Final ${formatCurrency(result.finalMonthlyCashflow)}`,
              fill: '#34d399',
              fontSize: 10,
              position: 'insideTopRight',
            }}
          />
          <Line
            type="stepAfter"
            dataKey="cashflow"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
