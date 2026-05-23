import type { ReactNode } from 'react';

export const chartColors = {
  grid: '#334155',
  axis: '#94a3b8',
  tooltipBg: 'rgba(15, 23, 42, 0.95)',
  tooltipBorder: 'rgba(255,255,255,0.1)',
};

export const chartMargin = { top: 8, right: 12, left: 0, bottom: 0 };

interface ChartCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Glass card wrapper for Recharts visualizations. */
export function ChartCard({ title, children, className = '' }: ChartCardProps) {
  return (
    <div className={`glass-card p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-slate-200">{title}</h3>
      <div className="h-64 w-full min-w-0 sm:h-72">{children}</div>
    </div>
  );
}
