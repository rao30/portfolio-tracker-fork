import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Portfolio, SimulationResult } from '../lib/types';
import { buildDecisionPulse } from '../lib/decisionPulse';
import type { DecisionPulseAnalysis } from '../lib/decisionPulseTypes';
import { formatCurrency, formatMonths, formatPercent, propertyColor } from '../lib/format';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import type { UseDecisionPulseResult } from '../lib/useDecisionPulse';
import { NumericInput } from './NumericInput';

interface DecisionPulseProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  activeResult: SimulationResult;
  comparisons: SimulationResult[];
  customOrder?: string[] | null;
  budgetMax: number;
  pulseHook: UseDecisionPulseResult;
  onBudgetChange: (value: number) => void;
  onStrategyChange: (value: StrategyId) => void;
  embedded?: boolean;
}

function verdictToneClass(tone: DecisionPulseAnalysis['verdictTone']): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

export function DecisionPulse({
  portfolio,
  activeStrategy,
  activeResult,
  comparisons,
  customOrder,
  budgetMax,
  pulseHook,
  onBudgetChange,
  onStrategyChange,
  embedded = false,
}: DecisionPulseProps) {
  const analysis = useMemo(
    () =>
      buildDecisionPulse(
        portfolio,
        activeStrategy,
        activeResult,
        comparisons,
        customOrder,
      ),
    [portfolio, activeStrategy, activeResult, comparisons, customOrder],
  );

  const { preferences, setCollapsed, setLastExploredBudget } = pulseHook;
  const [scrubBudget, setScrubBudget] = useState(portfolio.extraMonthlyBudget);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setScrubBudget(portfolio.extraMonthlyBudget);
  }, [portfolio.extraMonthlyBudget]);

  const handleBudgetScrub = useCallback(
    (value: number) => {
      const clamped = Math.min(budgetMax, Math.max(0, value));
      setScrubBudget(clamped);
      onBudgetChange(clamped);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void setLastExploredBudget(clamped);
      }, 600);
    },
    [budgetMax, onBudgetChange, setLastExploredBudget],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleBudgetScrub(scrubBudget + 100);
      } else if (e.key === '-') {
        e.preventDefault();
        handleBudgetScrub(scrubBudget - 100);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleBudgetScrub, scrubBudget]);

  const shell = embedded
    ? 'space-y-4'
    : 'glass-card overflow-hidden border-cyan-500/20';

  const currentSensitivity = analysis.sensitivity.find(
    (p) => p.budget === portfolio.extraMonthlyBudget,
  );

  if (preferences.isCollapsed) {
    return (
      <div className={shell}>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
              Decision Pulse
            </p>
            <p className="truncate text-sm text-slate-200">{analysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Debt-free</p>
            <p className="text-sm font-medium text-slate-200">{analysis.debtFreeLabel}</p>
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  return (
    <section className={shell} aria-label="Decision Pulse payoff command center">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
            Decision Pulse
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Plain-English payoff verdict · live what-if · monthly action
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(true)}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
          title="Collapse Decision Pulse"
        >
          Collapse
        </button>
      </div>

      <div className={`mx-4 mt-4 rounded-xl border px-4 py-3 ${verdictToneClass(analysis.verdictTone)}`}>
        <p className="text-sm leading-relaxed text-slate-100">{analysis.verdict}</p>
        <p className="mt-2 text-xs text-slate-400">
          Debt-free by{' '}
          <span className="font-medium text-slate-200">{analysis.debtFreeLabel}</span>
          {currentSensitivity && currentSensitivity.deltaMonths !== 0 && (
            <>
              {' '}
              · {formatMonths(activeResult.monthsToPayoff)} total
            </>
          )}
        </p>
      </div>

      <div className="mx-4 mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            This month&apos;s target
          </p>
          <div className="mt-3 flex items-start gap-3">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: propertyColor(analysis.action.propertyName) }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-100">
                {shortPropertyName(analysis.action.propertyName)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{analysis.action.rationale}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Balance</dt>
                  <dd className="font-mono tabular-nums text-slate-200">
                    {formatCurrency(analysis.action.balance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Rate</dt>
                  <dd className="font-mono tabular-nums text-slate-200">
                    {formatPercent(analysis.action.annualRate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">P&amp;I</dt>
                  <dd className="font-mono tabular-nums text-slate-200">
                    {formatCurrency(analysis.action.monthlyPayment)}/mo
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Payoff</dt>
                  <dd className="font-mono tabular-nums text-emerald-400">
                    {formatMonths(analysis.action.payoffMonth)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Strategy duel
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-emerald-400">Fastest</p>
                <p className="truncate text-sm font-medium text-slate-100">
                  {analysis.duel.winnerLabel}
                </p>
              </div>
              {analysis.duel.winner !== activeStrategy && (
                <button
                  type="button"
                  onClick={() => onStrategyChange(analysis.duel.winner)}
                  className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Apply
                </button>
              )}
              {analysis.duel.winner === activeStrategy && (
                <span className="shrink-0 text-xs text-emerald-400">Active</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-slate-500">Runner-up</p>
                <p className="truncate text-sm text-slate-300">
                  {analysis.duel.runnerUpLabel}
                </p>
              </div>
              {analysis.duel.monthsSaved > 0 && (
                <p className="shrink-0 text-right text-xs text-slate-400">
                  +{formatMonths(analysis.duel.monthsSaved)}
                  <br />
                  <span className="text-amber-300">
                    +{formatCurrency(analysis.duel.interestSaved)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Live budget what-if
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Drag to see debt-free date shift · press <kbd className="rounded border border-white/20 px-1">+</kbd> / <kbd className="rounded border border-white/20 px-1">−</kbd>
            </p>
          </div>
          <p className="font-mono text-lg tabular-nums text-cyan-300">
            {formatCurrency(scrubBudget)}
            <span className="text-sm text-slate-500">/mo</span>
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={budgetMax}
            step={100}
            value={scrubBudget}
            onChange={(e) => handleBudgetScrub(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-cyan-500"
            aria-label="Extra monthly budget what-if"
          />
          <NumericInput
            value={scrubBudget}
            onChange={(v) => handleBudgetScrub(v ?? 0)}
            min={0}
            max={budgetMax}
            className="w-24 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm tabular-nums text-slate-100"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {analysis.sensitivity.map((point) => {
            const isActive = point.budget === portfolio.extraMonthlyBudget;
            return (
              <button
                key={point.budget}
                type="button"
                onClick={() => handleBudgetScrub(point.budget)}
                className={`rounded-lg border px-2 py-2 text-left transition ${
                  isActive
                    ? 'border-cyan-400/50 bg-cyan-500/10'
                    : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                }`}
              >
                <p className="text-[10px] uppercase text-slate-500">
                  {point.budget === portfolio.extraMonthlyBudget ? 'Current' : formatCurrency(point.budget)}
                </p>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-200">
                  {formatMonths(point.monthsToPayoff)}
                </p>
                {point.deltaMonths !== 0 && (
                  <p
                    className={`mt-0.5 text-[10px] tabular-nums ${
                      point.deltaMonths < 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {point.deltaMonths > 0 ? '+' : ''}
                    {formatMonths(Math.abs(point.deltaMonths))}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {analysis.activeVsBest && (
        <p className="mx-4 mb-4 mt-3 text-center text-xs text-amber-300/90">
          Your current strategy is {formatMonths(analysis.activeVsBest.monthsBehind)} behind
          and costs {formatCurrency(analysis.activeVsBest.interestBehind)} more in interest.
          Switch to {STRATEGY_LABELS[analysis.duel.winner]} for the fastest path.
        </p>
      )}
    </section>
  );
}
