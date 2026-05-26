import {
  CartesianGrid,
  Line,
  LineChart,
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

interface IncomeVsExpenseChartProps {
  result: SimulationResult;
}

export function IncomeVsExpenseChart({ result }: IncomeVsExpenseChartProps) {
  const data = result.history.map((h) => ({
    month: h.month,
    rent: h.monthlyRent,
    operating: h.monthlyOperatingExpenses,
    utilities: h.monthlyUtilities,
    expenses: h.monthlyExpenses,
    pi: h.monthlyPi,
    capex: h.monthlyCapex,
    cashflow: h.monthlyCashflow,
  }));

  const maxMonth = result.history[result.history.length - 1]?.month ?? 1;

  return (
    <ChartCard title="Income vs expenses over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis {...timelineXAxisProps(maxMonth)} />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={formatCurrencyCompact}
            label={yAxisLabel('Monthly $')}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                rent: 'Gross rent',
                operating: 'Operating expenses',
                utilities: 'Utilities',
                expenses: 'Total expenses',
                pi: 'P&I',
                capex: 'Capex reserve',
                cashflow: 'Net cashflow',
              };
              return [formatCurrency(value), labels[name] ?? name];
            }}
            labelFormatter={(month) => formatMonths(Number(month))}
          />
          <Line
            type="monotone"
            dataKey="rent"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="operating"
            stroke="#fb923c"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="utilities"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#f87171"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="pi"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="capex"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="stepAfter"
            dataKey="cashflow"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
