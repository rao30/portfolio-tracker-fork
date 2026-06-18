import { useEffect, useState } from 'react';
import type { DashboardSection } from '../lib/dashboard-sections';

const STORAGE_KEY = 'rs-howitworks-dismissed';

interface HowItWorksProps {
  onJump: (section: DashboardSection) => void;
}

const STEPS: { n: number; title: string; body: string; go: DashboardSection; cta: string }[] = [
  {
    n: 1,
    title: 'Add your properties',
    body: 'Enter each rental, its loan, rent, and expenses. This is the data everything else runs on.',
    go: 'properties',
    cta: 'Open Properties',
  },
  {
    n: 2,
    title: 'Set your payoff plan',
    body: 'Choose how much extra you can pay each month and which loan to attack first.',
    go: 'plan',
    cta: 'Open Payoff Plan',
  },
  {
    n: 3,
    title: 'See your debt-free date',
    body: 'The Overview shows when you become debt-free and how your net worth grows.',
    go: 'charts',
    cta: 'See Charts',
  },
];

export function HowItWorks({ onJump }: HowItWorksProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
      >
        How does this tool work?
      </button>
    );
  }

  return (
    <section className="glass-card overflow-hidden border-cyan-500/20" aria-label="How this tool works">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">Start here</p>
          <h2 className="text-base font-semibold text-slate-100">How this tool works</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Rental Snowball simulates how fast you can pay off your rental loans by throwing extra cash
            at one loan at a time, then rolling each freed-up payment into the next.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
        >
          Got it
        </button>
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="flex flex-col rounded-xl border border-white/10 bg-slate-900/40 p-4"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-semibold text-cyan-300">
              {step.n}
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-100">{step.title}</p>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-400">{step.body}</p>
            <button
              type="button"
              onClick={() => onJump(step.go)}
              className="mt-3 w-fit rounded-lg border border-cyan-500/30 bg-cyan-600/10 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-600/20"
            >
              {step.cta} →
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
