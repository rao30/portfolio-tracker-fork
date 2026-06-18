import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import {
  STRATEGY_LABELS,
  runSimulation,
  runSimulationWithPayoffOrder,
  type StrategyId,
} from '../lib/snowball';
import {
  buildPlaybookSteps,
  comparePlaybookToStrategy,
  computeBalloonAlerts,
  defaultPlaybookOrder,
  moveInOrder,
  orderFromStrategy,
  type PlaybookStep,
} from '../lib/payoffPlaybook';
import { formatCurrency, formatMonths, formatPercent } from '../lib/format';
import type { UsePayoffPlaybookResult } from '../lib/usePayoffPlaybook';

interface PayoffPlaybookProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  scenario: ScenarioConfig;
  playbookHook: UsePayoffPlaybookResult;
  playbookActive: boolean;
  onApply: (order: string[]) => void;
  onDeactivate: () => void;
  embedded?: boolean;
}

function severityClass(severity: 'critical' | 'warning' | 'info'): string {
  if (severity === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-300';
  if (severity === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

function PlaybookRow({
  step,
  index,
  total,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  dragHandlers,
}: {
  step: PlaybookStep;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragHandlers: {
    draggable: boolean;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
}) {
  const isFirst = index === 0;
  const nextFreed = !isFirst ? null : step.cashflowFreed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      {...dragHandlers}
      className={`group rounded-xl border transition-all ${
        selected
          ? 'border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/30'
          : isFirst
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-white/10 bg-slate-900/40 hover:border-white/20'
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
              isFirst ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'
            }`}
          >
            {step.rank}
          </span>
          <span className="cursor-grab text-slate-600 active:cursor-grabbing" title="Drag to reorder">
            ⠿
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-slate-100" title={step.propertyName}>
              {shortPropertyName(step.propertyName)}
              {isFirst && (
                <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                  Attack next
                </span>
              )}
            </p>
            <p className="font-mono text-xs tabular-nums text-slate-400">
              {step.payoffMonth != null ? formatMonths(step.payoffMonth) : '—'}
            </p>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <span className="font-mono tabular-nums">{formatCurrency(step.balance)}</span>
            <span>{formatPercent(step.annualRate)} rate</span>
            <span className="font-mono tabular-nums">{formatCurrency(step.monthlyPayment)}/mo P&I</span>
          </div>

          {step.rationale.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {step.rationale.map((tag) => (
                <span
                  key={`${step.propertyName}-${tag.kind}-${tag.label}`}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(tag.severity)}`}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {isFirst && nextFreed != null && total > 1 && (
            <p className="mt-2 text-[11px] text-emerald-300/90">
              When paid off, {formatCurrency(nextFreed)}/mo snowballs into the next target.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={index === 0}
            className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/5 disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={index >= total - 1}
            className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/5 disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  );
}

export function PayoffPlaybook({
  portfolio,
  activeStrategy,
  scenario,
  playbookHook,
  playbookActive,
  onApply,
  onDeactivate,
  embedded = false,
}: PayoffPlaybookProps) {
  const [order, setOrder] = useState<string[]>(() => defaultPlaybookOrder(portfolio));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [baseStrategy, setBaseStrategy] = useState<StrategyId | null>('highestRate');
  const dragIndex = useRef<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (playbookHook.loading || initialized.current) return;
    if (playbookHook.playbook?.propertyOrder.length) {
      setOrder(playbookHook.playbook.propertyOrder);
      setBaseStrategy(playbookHook.playbook.baseStrategy);
      initialized.current = true;
      return;
    }
    const next = defaultPlaybookOrder(portfolio);
    setOrder(next);
    initialized.current = true;
  }, [playbookHook.loading, playbookHook.playbook, portfolio]);

  const steps = useMemo(
    () => buildPlaybookSteps(portfolio, order, scenario),
    [portfolio, order, scenario],
  );

  const balloonAlerts = useMemo(() => computeBalloonAlerts(portfolio), [portfolio]);

  const previewResult = useMemo(
    () => runSimulationWithPayoffOrder(portfolio, order, scenario),
    [portfolio, order, scenario],
  );

  const presetResult = useMemo(
    () => runSimulation(portfolio, activeStrategy, scenario),
    [portfolio, activeStrategy, scenario],
  );

  const vsActive = useMemo(
    () => ({
      monthsDelta: previewResult.monthsToPayoff - presetResult.monthsToPayoff,
      interestDelta: previewResult.totalInterestPaid - presetResult.totalInterestPaid,
    }),
    [previewResult, presetResult],
  );

  const moveRow = useCallback((from: number, to: number) => {
    setOrder((prev) => moveInOrder(prev, from, to));
    setSelectedIndex(to);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && selectedIndex > 0) {
        moveRow(selectedIndex, selectedIndex - 1);
      }
      if (e.key === 'ArrowDown' && selectedIndex < order.length - 1) {
        moveRow(selectedIndex, selectedIndex + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveRow, order.length, selectedIndex]);

  const applyPreset = (strategyId: StrategyId) => {
    const next = orderFromStrategy(portfolio, strategyId);
    setOrder(next);
    setBaseStrategy(strategyId);
    setSelectedIndex(0);
  };

  const handleApply = async () => {
    const ok = await playbookHook.savePlaybook({
      propertyOrder: order,
      baseStrategy,
      isActive: true,
    });
    if (ok) onApply(order);
  };

  const shell = embedded ? 'space-y-4' : 'glass-card space-y-4 p-4';

  return (
    <section className={shell} aria-label="Custom Payoff Order">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Custom Payoff Order</h2>
          <p className="mt-0.5 max-w-xl text-xs text-slate-400">
            Prefer to pick the order yourself? Drag or use ↑↓ to choose which property gets the extra
            payments next. Each step explains the trade-off — balloon risk, interest rate, and cashflow freed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {playbookActive && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              Active
            </span>
          )}
          {playbookHook.saving && (
            <span className="text-xs text-slate-500">Saving…</span>
          )}
          {playbookActive && (
            <button
              type="button"
              onClick={onDeactivate}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
            >
              Use preset strategy
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={playbookHook.saving || order.length === 0}
            className="rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Apply playbook
          </button>
        </div>
      </div>

      {balloonAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            Balloon risk radar
          </p>
          <div className="flex flex-wrap gap-2">
            {balloonAlerts.map((alert) => (
              <div
                key={alert.propertyName}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${severityClass(alert.severity)}`}
              >
                <span className="font-medium">{shortPropertyName(alert.propertyName)}</span>
                <span className="ml-1.5 opacity-80">
                  {alert.monthsUntilBalloon <= 12
                    ? `${alert.monthsUntilBalloon} mo`
                    : formatMonths(alert.monthsUntilBalloon)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(STRATEGY_LABELS) as StrategyId[]).slice(0, 4).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              baseStrategy === id
                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            Start: {STRATEGY_LABELS[id].replace(/\s*\(.*\)/, '')}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs">
        <span className="text-slate-400">Playbook preview</span>
        <span className="font-mono tabular-nums text-cyan-300">
          {formatMonths(previewResult.monthsToPayoff)} debt-free
        </span>
        <span className="text-slate-600">·</span>
        <span
          className={
            vsActive.monthsDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'
          }
        >
          {vsActive.monthsDelta === 0
            ? 'Same as current strategy'
            : vsActive.monthsDelta < 0
              ? `${formatMonths(Math.abs(vsActive.monthsDelta))} faster`
              : `${formatMonths(vsActive.monthsDelta)} slower`}{' '}
          vs {STRATEGY_LABELS[activeStrategy]}
        </span>
        {vsActive.interestDelta !== 0 && (
          <>
            <span className="text-slate-600">·</span>
            <span className={vsActive.interestDelta < 0 ? 'text-emerald-400' : 'text-amber-400'}>
              {formatCurrency(Math.abs(vsActive.interestDelta))}{' '}
              {vsActive.interestDelta < 0 ? 'less' : 'more'} interest
            </span>
          </>
        )}
      </div>

      {playbookHook.error && (
        <p className="text-xs text-red-400" role="alert">
          {playbookHook.error}
        </p>
      )}

      <div className="space-y-2">
        {steps.map((step, index) => (
          <PlaybookRow
            key={step.propertyName}
            step={step}
            index={index}
            total={steps.length}
            selected={selectedIndex === index}
            onSelect={() => setSelectedIndex(index)}
            onMoveUp={() => moveRow(index, index - 1)}
            onMoveDown={() => moveRow(index, index + 1)}
            dragHandlers={{
              draggable: true,
              onDragStart: () => {
                dragIndex.current = index;
              },
              onDragOver: (e) => e.preventDefault(),
              onDrop: () => {
                if (dragIndex.current != null && dragIndex.current !== index) {
                  moveRow(dragIndex.current, index);
                }
                dragIndex.current = null;
              },
              onDragEnd: () => {
                dragIndex.current = null;
              },
            }}
          />
        ))}
      </div>

      <p className="text-[10px] text-slate-500">
        Tip: select a row and press ↑↓ to reorder. {playbookHook.cloudBacked ? 'Synced to cloud.' : 'Saved locally until you sign in.'}
      </p>
    </section>
  );
}
