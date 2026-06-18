import { useMemo } from 'react';
import type { Portfolio, SimulationResult } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  buildBalloonSafetyAnalysis,
  budgetDeltaLabel,
  formatSafetyMargin,
  reorderForBalloonSafety,
  statusLabel,
  type BalloonSafetyStatus,
  type PropertyBalloonSafety,
} from '../lib/balloonSafety';
import { formatCurrency, formatMonths, propertyColor } from '../lib/format';
import type { UseBalloonSafetyResult } from '../lib/useBalloonSafety';

interface BalloonSafetyProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  activeResult: SimulationResult;
  customOrder?: string[] | null;
  safetyHook: UseBalloonSafetyResult;
  onBudgetChange: (value: number) => void;
  onPrioritizeInPlaybook?: (order: string[]) => void;
  currentPlaybookOrder?: string[];
  embedded?: boolean;
}

function statusToneClass(status: BalloonSafetyStatus): string {
  if (status === 'safe') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (status === 'tight' || status === 'cleared')
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (status === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-200';
  if (status === 'at_risk') return 'border-orange-500/40 bg-orange-500/10 text-orange-200';
  return 'border-white/10 bg-white/[0.02] text-slate-300';
}

function verdictToneClass(tone: 'positive' | 'caution' | 'neutral'): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function shortPropertyName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 24) return name.slice(0, slash).trim();
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

function TimelineBar({
  properties,
  timelineEndMonth,
  pinnedProperty,
}: {
  properties: PropertyBalloonSafety[];
  timelineEndMonth: number;
  pinnedProperty: string | null;
}) {
  const span = Math.max(timelineEndMonth, 12);

  return (
    <div className="relative mt-2 h-16 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-2">
      <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-white/10" />
      {properties.map((p) => {
        if (p.balloonMonth == null) return null;
        const balloonPct = Math.min(100, (p.balloonMonth / span) * 100);
        const payoffPct =
          p.payoffMonth != null ? Math.min(100, (p.payoffMonth / span) * 100) : null;
        const color = propertyColor(p.propertyName);
        const isPinned = pinnedProperty === p.propertyName;

        return (
          <div
            key={p.propertyName}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${balloonPct}%` }}
            title={`${p.propertyName}: balloon month ${p.balloonMonth}`}
          >
            <div
              className={`h-8 w-0.5 ${isPinned ? 'opacity-100' : 'opacity-70'}`}
              style={{ backgroundColor: color }}
            />
            <span
              className={`mt-0.5 max-w-[4.5rem] truncate text-[9px] ${isPinned ? 'font-semibold text-white' : 'text-slate-500'}`}
            >
              {shortPropertyName(p.propertyName)}
            </span>
            {payoffPct != null && (
              <div
                className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-slate-900"
                style={{
                  left: `${((payoffPct - balloonPct) / 100) * 200}px`,
                  backgroundColor: p.safetyMarginMonths != null && p.safetyMarginMonths >= 0 ? '#34d399' : '#f87171',
                }}
                title={`Payoff month ${p.payoffMonth}`}
              />
            )}
          </div>
        );
      })}
      <div className="absolute bottom-1 left-2 text-[9px] text-slate-600">Now</div>
      <div className="absolute bottom-1 right-2 text-[9px] text-slate-600">
        {formatMonths(span)}
      </div>
    </div>
  );
}

function PropertySafetyRow({
  row,
  selected,
  onSelect,
}: {
  row: PropertyBalloonSafety;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/20'
          : 'border-white/10 bg-slate-900/40 hover:border-white/20'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100" title={row.propertyName}>
            {shortPropertyName(row.propertyName)}
          </p>
          <span
            className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusToneClass(row.status)}`}
          >
            {statusLabel(row.status)}
          </span>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono tabular-nums text-slate-300">
            {row.monthsUntilBalloon != null
              ? `Balloon ${formatMonths(row.monthsUntilBalloon)}`
              : 'Balloon passed'}
          </p>
          <p className="mt-0.5 font-mono tabular-nums text-slate-500">
            Payoff {row.payoffMonth != null ? formatMonths(row.payoffMonth) : '—'}
          </p>
        </div>
      </div>

      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
        <div>
          <p className="text-slate-500">Safety margin</p>
          <p className="font-mono tabular-nums text-slate-200">
            {formatSafetyMargin(row.safetyMarginMonths)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Est. balloon balance</p>
          <p className="font-mono tabular-nums text-slate-200">
            {row.balloonBalanceEstimate != null
              ? formatCurrency(row.balloonBalanceEstimate)
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Post-refi P&I</p>
          <p className="font-mono tabular-nums text-slate-200">
            {row.refiPaymentEstimate != null
              ? `${formatCurrency(row.refiPaymentEstimate)}/mo`
              : '—'}
          </p>
        </div>
      </div>

      {row.actionLabel ? (
        <p className="mt-2 text-[11px] text-slate-400">{row.actionLabel}</p>
      ) : null}
    </button>
  );
}

export function BalloonSafety({
  portfolio,
  activeStrategy,
  activeResult,
  customOrder,
  safetyHook,
  onBudgetChange,
  onPrioritizeInPlaybook,
  currentPlaybookOrder,
  embedded = false,
}: BalloonSafetyProps) {
  const analysis = useMemo(
    () =>
      buildBalloonSafetyAnalysis(
        portfolio,
        activeStrategy,
        customOrder,
        null,
        1,
      ),
    [portfolio, activeStrategy, customOrder],
  );

  const { preferences, setCollapsed, setPinnedProperty } = safetyHook;

  const visibleProperties = useMemo(() => {
    if (preferences.showCleared) return analysis.properties;
    return analysis.properties.filter(
      (p) => p.status !== 'safe' && p.status !== 'tight',
    );
  }, [analysis.properties, preferences.showCleared]);

  const pinned =
    preferences.pinnedProperty != null
      ? analysis.properties.find((p) => p.propertyName === preferences.pinnedProperty)
      : analysis.properties[0];

  const shell = embedded ? 'space-y-4' : 'glass-card overflow-hidden border-amber-500/20';

  if (analysis.sellerCount === 0) {
    return null;
  }

  if (preferences.isCollapsed) {
    return (
      <div className={shell}>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              Balloon Deadline Check
            </p>
            <p className="truncate text-sm text-slate-200">{analysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            {analysis.atRiskCount > 0 ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                {analysis.atRiskCount} at risk
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                All clear
              </span>
            )}
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  const handleFixPlaybook = () => {
    if (!onPrioritizeInPlaybook) return;
    const base = currentPlaybookOrder?.length
      ? currentPlaybookOrder
      : portfolio.properties.filter((p) => p.balance > 0).map((p) => p.name);
    onPrioritizeInPlaybook(reorderForBalloonSafety(portfolio, base, analysis));
  };

  const handleApplyBudgetFix = () => {
    if (analysis.minBudgetToClearWorst == null) return;
    onBudgetChange(portfolio.extraMonthlyBudget + analysis.minBudgetToClearWorst);
  };

  return (
    <section className={shell} aria-label="Balloon Deadline Check">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
            Balloon Deadline Check
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            For seller-financed loans with a balloon payment due, checks whether your plan pays them
            off in time — and flags any that won't.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(true)}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
          aria-label="Collapse Balloon Deadline Check"
        >
          ▲
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className={`rounded-xl border p-3 ${verdictToneClass(analysis.verdictTone)}`}>
          <p className="text-sm text-slate-100">{analysis.verdict}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>{analysis.sellerCount} seller notes</span>
            <span className="text-emerald-400">{analysis.safeCount} balloon-safe</span>
            {analysis.atRiskCount > 0 && (
              <span className="text-amber-300">{analysis.atRiskCount} at risk</span>
            )}
            {analysis.criticalCount > 0 && (
              <span className="text-red-300">{analysis.criticalCount} critical</span>
            )}
          </div>
        </div>

        {(analysis.atRiskCount > 0 || analysis.minBudgetToClearWorst != null) && (
          <div className="flex flex-wrap gap-2">
            {onPrioritizeInPlaybook && analysis.atRiskCount > 0 && (
              <button
                type="button"
                onClick={handleFixPlaybook}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
              >
                Prioritize at-risk in playbook
              </button>
            )}
            {analysis.minBudgetToClearWorst != null && (
              <button
                type="button"
                onClick={handleApplyBudgetFix}
                className="rounded-lg border border-cyan-500/30 bg-cyan-600/20 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-600/30"
              >
                Add {budgetDeltaLabel(analysis.minBudgetToClearWorst)} to clear{' '}
                {analysis.worstPropertyName
                  ? shortPropertyName(analysis.worstPropertyName)
                  : 'worst'}
              </button>
            )}
          </div>
        )}

        <TimelineBar
          properties={analysis.properties}
          timelineEndMonth={analysis.timelineEndMonth}
          pinnedProperty={preferences.pinnedProperty}
        />

        <div className="space-y-2">
          {visibleProperties.map((row) => (
            <PropertySafetyRow
              key={row.propertyName}
              row={row}
              selected={pinned?.propertyName === row.propertyName}
              onSelect={() => void setPinnedProperty(row.propertyName)}
            />
          ))}
        </div>

        <p className="text-[10px] text-slate-500">
          Green dot = projected payoff month · vertical bar = balloon due. Competitors model
          balloons in isolation — this ties your live snowball strategy to each deadline.
          {safetyHook.cloudBacked ? ' Preferences synced.' : ''}
        </p>
      </div>
    </section>
  );
}
