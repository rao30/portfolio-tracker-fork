import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChartId } from '../lib/dashboard-sections';

export interface ChartPanel {
  id: ChartId;
  label: string;
  shortLabel: string;
  content: ReactNode;
}

interface ChartNavigatorProps {
  charts: ChartPanel[];
  /** Start on this chart when the section opens. */
  initialChart?: ChartId;
}

export function ChartNavigator({ charts, initialChart }: ChartNavigatorProps) {
  const [activeId, setActiveId] = useState<ChartId>(
    initialChart ?? charts[0]?.id ?? 'net-worth',
  );
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const pillRefs = useRef<Partial<Record<ChartId, HTMLButtonElement | null>>>({});
  const activeIndex = charts.findIndex((c) => c.id === activeId);

  const goTo = useCallback(
    (id: ChartId) => {
      const nextIndex = charts.findIndex((c) => c.id === id);
      if (nextIndex < 0) return;
      setDirection(nextIndex >= activeIndex ? 'right' : 'left');
      setActiveId(id);
    },
    [charts, activeIndex],
  );

  const goPrev = useCallback(() => {
    if (activeIndex > 0) goTo(charts[activeIndex - 1].id);
  }, [activeIndex, charts, goTo]);

  const goNext = useCallback(() => {
    if (activeIndex < charts.length - 1) goTo(charts[activeIndex + 1].id);
  }, [activeIndex, charts, goTo]);

  useEffect(() => {
    const el = pillRefs.current[activeId];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  const active = charts[activeIndex];

  if (!active) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIndex === 0}
          aria-label="Previous chart"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Chart navigation"
        >
          {charts.map((chart) => {
            const isActive = chart.id === activeId;
            return (
              <button
                key={chart.id}
                ref={(el) => {
                  pillRefs.current[chart.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => goTo(chart.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {chart.shortLabel}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={activeIndex === charts.length - 1}
          aria-label="Next chart"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold text-slate-200">{active.label}</h2>
        <span className="text-xs tabular-nums text-slate-500">
          {activeIndex + 1} / {charts.length}
        </span>
      </div>

      <div className="relative overflow-hidden">
        <div
          key={activeId}
          className={`nav-panel-enter-${direction}`}
          role="tabpanel"
        >
          {active.content}
        </div>
      </div>
    </div>
  );
}
