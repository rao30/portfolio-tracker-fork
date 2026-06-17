import { useMemo, type ReactNode } from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import {
  runSimulation,
  SCENARIO_PRESETS,
  snapshotAtMonth,
  STRATEGY_LABELS,
  type StrategyId,
} from '../lib/snowball';
import {
  formatCurrency,
  formatMonths,
  cashflowToneClass,
} from '../lib/format';
import {
  STRATEGY_LAB_SLOTS,
  type StrategyLabPin,
  type StrategyLabState,
} from '../lib/strategyLab';

interface StrategyLabProps {
  portfolio: Portfolio;
  state: StrategyLabState;
  loading: boolean;
  syncing: boolean;
  toast: string | null;
  currentScenario: ScenarioConfig;
  currentStrategy: StrategyId;
  currentBudget: number;
  onPin: (slot?: number) => void;
  onApply: (slot: number) => void;
  onUnpin: (slot: number) => void;
  embedded?: boolean;
}

interface SlotMetrics {
  monthsToPayoff: number;
  monthsDelta: number;
  equityDelta: number;
}

function computeSlotMetrics(
  portfolio: Portfolio,
  pin: StrategyLabPin,
  baseMonths: number,
  baseEquity: number,
): SlotMetrics {
  const simPortfolio = { ...portfolio, extraMonthlyBudget: pin.extraBudget };
  const result = runSimulation(simPortfolio, pin.strategy, pin.scenario);
  const at180 = snapshotAtMonth(result, 180);
  return {
    monthsToPayoff: result.monthsToPayoff,
    monthsDelta: result.monthsToPayoff - baseMonths,
    equityDelta: (at180?.totalEquity ?? 0) - baseEquity,
  };
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-white/15 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 shadow-sm">
      {children}
    </kbd>
  );
}

export function StrategyLab({
  portfolio,
  state,
  loading,
  syncing,
  toast,
  currentScenario,
  currentStrategy,
  currentBudget,
  onPin,
  onApply,
  onUnpin,
  embedded = false,
}: StrategyLabProps) {
  const baseCase = useMemo(() => {
    const result = runSimulation(portfolio, currentStrategy, SCENARIO_PRESETS[0]);
    const at180 = snapshotAtMonth(result, 180);
    return {
      months: result.monthsToPayoff,
      equity: at180?.totalEquity ?? 0,
    };
  }, [portfolio, currentStrategy]);

  const slotMetrics = useMemo(() => {
    const map = new Map<number, SlotMetrics>();
    for (const pin of state.pins) {
      map.set(
        pin.slot,
        computeSlotMetrics(portfolio, pin, baseCase.months, baseCase.equity),
      );
    }
    return map;
  }, [portfolio, state.pins, baseCase]);

  const matchesCurrent = (pin: StrategyLabPin) =>
    pin.scenario.id === currentScenario.id &&
    pin.strategy === currentStrategy &&
    pin.extraBudget === currentBudget;

  const shell = embedded
    ? 'space-y-3'
    : 'glass-card space-y-4 p-4 ring-1 ring-cyan-500/20';

  return (
    <section className={shell} aria-label="Strategy Lab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Strategy Lab</h2>
            <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
              Premium
            </span>
            {syncing && (
              <span className="text-[10px] text-slate-500">Syncing…</span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Pin what-if scenarios and flip between them instantly. Press{' '}
            <Kbd>1</Kbd>–<Kbd>9</Kbd> to apply a slot, <Kbd>Ctrl</Kbd>+<Kbd>P</Kbd>{' '}
            to pin the current setup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPin()}
          className="shrink-0 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
        >
          Pin current <span className="ml-1 opacity-70">Ctrl+P</span>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {Array.from({ length: STRATEGY_LAB_SLOTS }, (_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-white/5 bg-slate-800/40"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {Array.from({ length: STRATEGY_LAB_SLOTS }, (_, i) => {
            const slot = i + 1;
            const pin = state.pins.find((p) => p.slot === slot);
            const isActive = state.activeSlot === slot;
            const isLive = pin ? matchesCurrent(pin) : false;
            const metrics = pin ? slotMetrics.get(slot) : null;

            if (!pin) {
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onPin(slot)}
                  className="group flex min-h-[6.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-slate-900/30 px-2 py-3 text-center transition hover:border-cyan-500/40 hover:bg-cyan-500/5"
                >
                  <Kbd>{slot}</Kbd>
                  <span className="mt-2 text-[10px] text-slate-500 group-hover:text-slate-400">
                    Empty — click to pin
                  </span>
                </button>
              );
            }

            return (
              <div
                key={slot}
                className={`relative flex min-h-[6.5rem] flex-col rounded-lg border px-2 py-2 transition ${
                  isActive
                    ? 'border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'border-white/10 bg-slate-900/50 hover:border-white/20'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => onApply(slot)}
                    className="flex items-center gap-1 text-left"
                    title={`Apply slot ${slot}`}
                  >
                    <Kbd>{slot}</Kbd>
                    {isLive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Live" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUnpin(slot)}
                    className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-red-300"
                    title="Clear slot"
                    aria-label={`Clear slot ${slot}`}
                  >
                    ×
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(slot)}
                  className="flex flex-1 flex-col text-left"
                >
                  <span className="line-clamp-2 text-xs font-medium leading-tight text-slate-100">
                    {pin.label}
                  </span>
                  <span className="mt-0.5 truncate text-[10px] text-slate-500">
                    {STRATEGY_LABELS[pin.strategy]} · {formatCurrency(pin.extraBudget)}/mo
                  </span>
                  {metrics && (
                    <div className="mt-auto space-y-0.5 pt-1 text-[10px]">
                      <div className="text-slate-400">
                        Payoff {formatMonths(metrics.monthsToPayoff)}
                      </div>
                      <div
                        className={
                          metrics.monthsDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }
                      >
                        {metrics.monthsDelta === 0
                          ? 'Same as base'
                          : metrics.monthsDelta < 0
                            ? `${formatMonths(Math.abs(metrics.monthsDelta))} faster`
                            : `${formatMonths(metrics.monthsDelta)} slower`}
                      </div>
                      <div className={cashflowToneClass(metrics.equityDelta)}>
                        {metrics.equityDelta >= 0 ? '+' : ''}
                        {formatCurrency(metrics.equityDelta)} yr-15
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-slate-900/95 px-4 py-2 text-sm text-cyan-100 shadow-lg backdrop-blur sm:bottom-8"
        >
          {toast}
        </div>
      )}
    </section>
  );
}
