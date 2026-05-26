import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Portfolio } from '../lib/types';
import { runSimulation, type StrategyId } from '../lib/snowball';
import { runMonteCarloEquity } from '../lib/analytics';
import { formatCurrencyCompact, formatMonths } from '../lib/format';
import {
  ChartCard,
  chartColors,
  chartMargin,
  timelineXAxisProps,
  yAxisLabel,
} from './chart-theme';

interface MonteCarloChartProps {
  portfolio: Portfolio;
  strategyId: StrategyId;
}

export function MonteCarloChart({ portfolio, strategyId }: MonteCarloChartProps) {
  const sampleMonths = [60, 120, 180, 240];

  const bands = useMemo(() => {
    return runMonteCarloEquity(
      (appShift, rentShift, vacancy) => {
        const p = {
          ...portfolio,
          annualRentGrowthRate: portfolio.annualRentGrowthRate + rentShift,
          defaultVacancyRate: vacancy,
          properties: portfolio.properties.map((prop) => ({
            ...prop,
            annualAppreciationRate: prop.annualAppreciationRate + appShift,
          })),
        };
        return runSimulation(p, strategyId);
      },
      sampleMonths,
      { runs: 40 },
    );
  }, [portfolio, strategyId]);

  const maxMonth = sampleMonths[sampleMonths.length - 1];

  return (
    <ChartCard title="Equity uncertainty (Monte Carlo p10 / p50 / p90)">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={bands} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
          <XAxis
            {...timelineXAxisProps(maxMonth)}
            dataKey="month"
            tickFormatter={(m) => formatMonths(Number(m))}
          />
          <YAxis
            stroke={chartColors.axis}
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            tickFormatter={formatCurrencyCompact}
            label={yAxisLabel('Equity')}
          />
          <Tooltip
            contentStyle={{
              background: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatCurrencyCompact(value),
              name,
            ]}
            labelFormatter={(month) => formatMonths(Number(month))}
          />
          <Area
            type="monotone"
            dataKey="p90"
            stroke="none"
            fill="#22d3ee"
            fillOpacity={0.12}
            name="p90"
          />
          <Area
            type="monotone"
            dataKey="p10"
            stroke="none"
            fill="#0f172a"
            fillOpacity={1}
            name="p10"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#22d3ee"
            strokeWidth={2}
            dot
            name="Median"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
