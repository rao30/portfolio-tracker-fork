import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../lib/types';
import { formatCurrency } from '../lib/format';
import { ChartCard, chartColors, chartMargin } from './chart-theme';

interface CashflowChartProps {
  result: SimulationResult;
}

export function CashflowChart({ result }: CashflowChartProps) {
  const data = result.history.map((h) => ({
    month: h.month,
    cashflow: h.monthlyCashflow,
  }));

  return (
    <ChartCard title="Monthly cashflow (grows as loans pay off)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={chartMargin}>
          <XAxis dataKey="month" stroke={chartColors.axis} fontSize={11} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tickFormatter={(v) => `$${v}`}
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
          <ReferenceLine
            y={result.finalMonthlyCashflow}
            stroke="#34d399"
            strokeDasharray="6 4"
            label={{
              value: 'Final',
              fill: '#34d399',
              fontSize: 11,
              position: 'insideTopRight',
            }}
          />
          <Area
            type="stepAfter"
            dataKey="cashflow"
            stroke="#a78bfa"
            fill="#a78bfa"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
