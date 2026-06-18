import { useEffect, useState } from 'react';
import type { DashboardSection } from '../lib/dashboard-sections';

const STORAGE_KEY = 'rs.gettingStarted.dismissed.v1';

interface Step {
  section: DashboardSection;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    section: 'properties',
    title: '1 · Add your properties',
    body: 'Enter each rental — value, loan balance, rate, rent, and expenses. The whole simulator runs off these numbers.',
  },
  {
    section: 'plan',
    title: '2 · Set your plan',
    body: 'Choose how much extra you can throw at the loans each month and which payoff strategy to use (snowball, avalanche, and more).',
  },
  {
    section: 'overview',
    title: '3 · See your debt-free date',
    body: 'The Overview shows when every loan is paid off and how your equity and cashflow grow along the way.',
  },
  {
    section: 'decisions',
    title: '4 · Explore decisions',
    body: 'Compare paying down debt vs. saving vs. buying more, catch balloon-loan deadlines, and stress-test against bad years.',
  },
];

interface GettingStartedProps {
  onNavigate: (section: DashboardSection) => void;
}

export function GettingStarted({ onNavigate }: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (dismissed) return null;

  return (
    <section className="app-surface relative overflow-hidden p-5" aria-label="Getting started">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
            New here?
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            How Rental Snowball works
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            This tool simulates paying off your rental mortgages early. Feed it your
            properties, pick how aggressively to pay down debt, and see exactly when
            you&apos;ll be debt-free — then pressure-test the plan.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
        >
          Got it
        </button>
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => onNavigate(step.section)}
              className="group flex h-full w-full flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/5"
            >
              <span className="text-sm font-semibold text-slate-100">{step.title}</span>
              <span className="mt-1 text-xs leading-relaxed text-slate-400">
                {step.body}
              </span>
              <span className="mt-2 text-xs font-medium text-cyan-400 opacity-0 transition group-hover:opacity-100">
                Go →
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
