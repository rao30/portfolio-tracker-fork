import { createContext, useContext, type ReactNode } from 'react';

export const ChartVariantContext = createContext<'card' | 'flat'>('card');
import { buildTimelineTicks, monthInYear, yearFromMonth } from '../lib/format';

export const chartColors = {
  grid: '#334155',
  axis: '#94a3b8',
  tooltipBg: 'rgba(15, 23, 42, 0.95)',
  tooltipBorder: 'rgba(255,255,255,0.1)',
  yearMark: '#67e8f9',
};

/** Extra bottom/left room for axis titles and two-line month ticks. */
export const chartMargin = { top: 16, right: 16, left: 4, bottom: 40 };

const axisLabelStyle = { fill: chartColors.axis, fontSize: 11 };

export const xAxisLabel = (text: string) => ({
  value: text,
  position: 'insideBottom' as const,
  offset: -16,
  style: axisLabelStyle,
});

export const yAxisLabel = (text: string) => ({
  value: text,
  angle: -90,
  position: 'insideLeft' as const,
  offset: 10,
  style: axisLabelStyle,
});

interface MonthYearTickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
}

/** Two-line tick: month count below, year marker above at January boundaries. */
export function MonthYearTick({ x = 0, y = 0, payload }: MonthYearTickProps) {
  const month = Number(payload?.value ?? 0);
  if (!month) return null;

  const year = yearFromMonth(month);
  const m = monthInYear(month);
  const isYearStart = m === 1 && month > 1;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        y={16}
        textAnchor="middle"
        fill={chartColors.axis}
        fontSize={10}
        fontFamily="JetBrains Mono, ui-monospace, monospace"
      >
        {month}
      </text>
      {isYearStart ? (
        <text
          y={0}
          textAnchor="middle"
          fill={chartColors.yearMark}
          fontSize={9}
          fontWeight={600}
        >
          Y{year}
        </text>
      ) : null}
    </g>
  );
}

/** Shared X-axis props for simulation month timelines. */
export function timelineXAxisProps(maxMonth: number) {
  return {
    dataKey: 'month' as const,
    ticks: buildTimelineTicks(maxMonth),
    tick: <MonthYearTick />,
    stroke: chartColors.axis,
    tickLine: { stroke: chartColors.grid },
    axisLine: { stroke: chartColors.grid },
    label: xAxisLabel('Months'),
  };
}

/** X-axis props for numeric month scales (horizontal bar charts). */
export function monthScaleXAxisProps(maxMonth: number, axisTitle: string) {
  return {
    type: 'number' as const,
    ticks: buildTimelineTicks(maxMonth),
    tickFormatter: (month: number) => {
      const m = monthInYear(month);
      if (m === 1 && month > 1) return `Y${yearFromMonth(month)}`;
      return `${month}`;
    },
    stroke: chartColors.axis,
    fontSize: 11,
    tick: { fill: chartColors.axis },
    tickLine: { stroke: chartColors.grid },
    axisLine: { stroke: chartColors.grid },
    label: xAxisLabel(axisTitle),
  };
}

interface ChartCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Flat sections use dividers inside one surface instead of nested cards. */
  variant?: 'card' | 'flat';
}

/** Wrapper for Recharts visualizations. */
export function ChartCard({
  title,
  children,
  className = '',
  variant: variantProp,
}: ChartCardProps) {
  const variant = variantProp ?? useContext(ChartVariantContext);
  const shell =
    variant === 'flat'
      ? `section-divider px-3 py-4 sm:px-4 ${className}`
      : `glass-card p-4 ${className}`;

  return (
    <div className={shell}>
      <h3 className="mb-3 text-sm font-semibold text-slate-200">{title}</h3>
      <div className="h-56 w-full min-w-0 sm:h-64 lg:h-72">{children}</div>
    </div>
  );
}
