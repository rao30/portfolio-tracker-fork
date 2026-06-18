import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio } from '../lib/types';
import {
  computeBudgetSensitivity,
  computeDecisionPulsePreview,
  computePreviewDelta,
} from '../lib/decisionPulse';
import type { DecisionPulseAnalysis } from '../lib/decisionPulseTypes';
import { formatCurrency, formatMonths, formatPercent, propertyColor } from '../lib/format';
import { STRATEGY_LABELS, type StrategyId } from '../lib/snowball';
import type { UseDecisionPulseResult } from '../lib/useDecisionPulse';
import { NumericInput } from './NumericInput';

interface DecisionPulseProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  customOrder?: string[] | null;
  budgetMax: number;
  pulseHook: UseDecisionPulseResult;
  onApplyBudget: (value: number) => void;
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
  customOrder,
  budgetMax,
  pulseHook,
  onApplyBudget,
  onStrategyChange,
  embedded = false,
}: DecisionPulseProps) {
  const committedBudget = portfolio.extraMonthlyBudget;
  const { preferences, setCollapsed, setLastExploredBudget } = pulseHook;
  const budgetStep = preferences.budgetStep;

  const [previewBudget, setPreviewBudget] = useState(committedBudget);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setPreviewBudget(committedBudget);
  }, [committedBudget]);

  const deferredPreviewBudget = useDeferredValue(previewBudget);
  const isPreviewStale = previewBudget !== deferredPreviewBudget;
  const isDirty = previewBudget !== committedBudget;

  const committedAnalysis = useMemo(
    () =>
      computeDecisionPulsePreview(
        portfolio,
        committedBudget,
        activeStrategy,
        customOrder,
      ),
    [portfolio, committedBudget, activeStrategy, customOrder],
  );

  const previewAnalysis = useMemo(
    () =>
      computeDecisionPulsePreview(
        portfolio,
        deferredPreviewBudget,
        activeStrategy,
        customOrder,
      ),
    [portfolio, deferredPreviewBudget, activeStrategy, customOrder],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const previewDelta = useMemo(
    () =>
      computePreviewDelta(
        portfolio,
        deferredPreviewBudget,
        activeStrategy,
        customOrder,
      ),
    [portfolio, deferredPreviewBudget, activeStrategy, customOrder],
  );

  const sensitivity = useMemo(
    () => computeBudgetSensitivity(portfolio, activeStrategy, customOrder),
    [portfolio, activeStrategy, customOrder],
  );

  const handlePreviewChange = useCallback(
    (value: number) => {
      const clamped = Math.min(budgetMax, Math.max(0, value));
      const stepped = Math.round(clamped / budgetStep) * budgetStep;
      setPreviewBudget(stepped);
    },
    [budgetMax, budgetStep],
  );

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    onApplyBudget(previewBudget);
    void setLastExploredBudget(previewBudget);
  }, [isDirty, onApplyBudget, previewBudget, setLastExploredBudget]);

  const handleReset = useCallback(() => {
    setPreviewBudget(committedBudget);
  }, [committedBudget]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isDirty) return undefined;
    debounceRef.current = setTimeout(() => {
      void setLastExploredBudget(previewBudget);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, previewBudget, setLastExploredBudget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-decision-pulse]'))
      ) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handlePreviewChange(previewBudget + budgetStep);
      } else if (e.key === '-') {
        e.preventDefault();
        handlePreviewChange(previewBudget - budgetStep);
      } else if (e.key === 'Enter' && isDirty) {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApply, handlePreviewChange, handleReset, isDirty, previewBudget, budgetStep]);

  const shell = embedded
    ? 'space-y-4'
    : 'glass-card overflow-hidden border-cyan-500/20';

  if (preferences.isCollapsed) {
    return (
      <div className={shell} data-decision-pulse>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
              Payoff Plan
            </p>
            <p className="truncate text-sm text-slate-200">{committedAnalysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Debt-free</p>
            <p className="text-sm font-medium text-slate-200">
              {committedAnalysis.debtFreeLabel}
            </p>
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={shell}
      aria-label="Payoff Plan"
      data-decision-pulse
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
            Payoff Plan
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Your debt-free verdict, which loan to pay extra on this month, and a slider to test a
            bigger monthly budget before you commit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(true)}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
          title="Collapse Payoff Plan"
        >
          Collapse
        </button>
      </div>

      {isDirty && (
        <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Preview mode
            </p>
            <p className="mt-1 text-sm text-slate-100">
              Exploring {formatCurrency(previewBudget)}/mo — your portfolio still uses{' '}
              {formatCurrency(committedBudget)}/mo until you apply.
            </p>
            {previewDelta && (
              <p className="mt-1 text-xs text-slate-400">
                Debt-free moves from {previewDelta.debtFreeLabelCommitted} to{' '}
                <span className="font-medium text-slate-200">
                  {previewDelta.debtFreeLabelPreview}
                </span>
                {previewDelta.monthsDelta !== 0 && (
                  <>
                    {' '}
                    (
                    <span
                      className={
                        previewDelta.monthsDelta < 0 ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {previewDelta.monthsDelta < 0 ? '−' : '+'}
                      {formatMonths(Math.abs(previewDelta.monthsDelta))}
                    </span>
                    )
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500"
            >
              Apply budget
            </button>
          </div>
        </div>
      )}

      <div
        className={`mx-4 mt-4 rounded-xl border px-4 py-3 transition-opacity ${verdictToneClass(analysis.verdictTone)} ${
          isPreviewStale ? 'opacity-60' : 'opacity-100'
        }`}
      >
        <p className="text-sm leading-relaxed text-slate-100">{analysis.verdict}</p>
        <p className="mt-2 text-xs text-slate-400">
          {isDirty ? 'Preview debt-free by' : 'Debt-free by'}{' '}
          <span className="font-medium text-slate-200">{analysis.debtFreeLabel}</span>
          {!isDirty && (
            <>
              {' '}
              · {formatCurrency(committedBudget)}/mo committed
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
              Budget what-if
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Preview payoff impact ·{' '}
              <kbd className="rounded border border-white/20 px-1">Enter</kbd> apply ·{' '}
              <kbd className="rounded border border-white/20 px-1">Esc</kbd> reset ·{' '}
              <kbd className="rounded border border-white/20 px-1">+</kbd>/
              <kbd className="rounded border border-white/20 px-1">−</kbd> step
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg tabular-nums text-cyan-300">
              {formatCurrency(previewBudget)}
              <span className="text-sm text-slate-500">/mo</span>
            </p>
            {isDirty && (
              <p className="text-[10px] text-amber-300">
                committed {formatCurrency(committedBudget)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={budgetMax}
            step={budgetStep}
            value={previewBudget}
            onChange={(e) => handlePreviewChange(Number(e.target.value))}
            onPointerDown={() => setIsScrubbing(true)}
            onPointerUp={() => setIsScrubbing(false)}
            onPointerCancel={() => setIsScrubbing(false)}
            className={`h-2 flex-1 cursor-pointer accent-cyan-500 [touch-action:none] ${
              isScrubbing ? 'opacity-90' : ''
            }`}
            aria-label="Extra monthly budget preview"
            aria-valuetext={`${formatCurrency(previewBudget)} per month preview`}
          />
          <NumericInput
            value={previewBudget}
            onChange={(v) => handlePreviewChange(v ?? 0)}
            min={0}
            max={budgetMax}
            className="w-24 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 font-mono text-sm tabular-nums text-slate-100"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sensitivity.map((point) => {
            const isCommitted = point.budget === committedBudget;
            const isPreview = point.budget === previewBudget;
            return (
              <button
                key={point.budget}
                type="button"
                onClick={() => handlePreviewChange(point.budget)}
                className={`rounded-lg border px-2 py-2 text-left transition ${
                  isPreview
                    ? 'border-cyan-400/50 bg-cyan-500/10'
                    : isCommitted
                      ? 'border-white/20 bg-slate-900/60'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                }`}
              >
                <p className="text-[10px] uppercase text-slate-500">
                  {isCommitted ? 'Committed' : formatCurrency(point.budget)}
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
