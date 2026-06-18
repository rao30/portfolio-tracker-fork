import { useCallback, useRef, type ReactNode } from 'react';
import type { Portfolio, PropertyEventOverlay, SimulationResult } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import type { SyncStatus } from '../lib/usePortfolio';
import {
  MOBILE_MISSION_MODULE_META,
  type MobileMissionModuleId,
} from '../lib/mobileMissionControlTypes';
import type { UseMobileMissionControlResult } from '../lib/useMobileMissionControl';
import { formatCurrency, formatMonths } from '../lib/format';
import { STRATEGY_LABELS } from '../lib/snowball';
import { DecisionPulse } from './DecisionPulse';
import { Controls } from './Controls';
import { BalloonSafety } from './BalloonSafety';
import { PayoffLandscape } from './PayoffLandscape';
import { StressLab } from './StressLab';
import { TimelineStudio } from './TimelineStudio';
import { PrincipalVelocity } from './PrincipalVelocity';
import { PortfolioDashboard } from './PortfolioDashboard';
import { PayoffPlaybook } from './PayoffPlaybook';
import { StrategyLab } from './StrategyLab';
import { GoalTracker } from './GoalTracker';
import type { UseTimelinePreferencesResult } from '../lib/useTimelinePreferences';

interface SyncBarProps {
  isDirty: boolean;
  saving: boolean;
  syncStatus: SyncStatus;
  cloudEnabled: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}

function SyncBar({
  isDirty,
  saving,
  syncStatus,
  cloudEnabled,
  onSave,
  onDiscard,
}: SyncBarProps) {
  if (!isDirty && syncStatus !== 'saving' && syncStatus !== 'error') return null;

  const message = (() => {
    if (saving || syncStatus === 'saving') {
      return cloudEnabled ? 'Saving to cloud…' : 'Saving…';
    }
    if (syncStatus === 'error') return 'Save failed — tap Save to retry';
    if (isDirty && cloudEnabled) return 'Unsaved edits · auto-save in ~2s';
    if (isDirty) return 'Unsaved edits';
    return null;
  })();

  if (!message) return null;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        syncStatus === 'error'
          ? 'border-red-500/40 bg-red-500/10'
          : isDirty
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-cyan-500/30 bg-cyan-500/10'
      }`}
      role="status"
      aria-live="polite"
    >
      <p className="min-w-0 text-xs text-slate-200">{message}</p>
      <div className="flex shrink-0 gap-1.5">
        {onDiscard && isDirty ? (
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300"
          >
            Discard
          </button>
        ) : null}
        {onSave && (isDirty || syncStatus === 'error') ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white"
          >
            {saving ? '…' : 'Save now'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface HeroStripProps {
  portfolio: Portfolio;
  result: SimulationResult;
  strategyId: StrategyId;
  show: boolean;
}

function HeroStrip({ portfolio, result, strategyId, show }: HeroStripProps) {
  if (!show) return null;

  const finalSnapshot = result.history[result.history.length - 1];
  const startingDebt = result.history[0]?.totalBalance ?? 0;

  return (
    <section
      className="grid grid-cols-3 gap-2"
      aria-label="Portfolio mission summary"
    >
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-cyan-300/80">
          Debt-free
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
          {formatMonths(result.monthsToPayoff)}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {STRATEGY_LABELS[strategyId as StrategyId]}
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Extra budget
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
          {formatCurrency(portfolio.extraMonthlyBudget)}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">/mo snowball</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Debt today
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
          {formatCurrency(startingDebt)}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          → {formatCurrency(finalSnapshot?.totalBalance ?? 0)}
        </p>
      </div>
    </section>
  );
}

interface ModuleShellProps {
  id: MobileMissionModuleId;
  label: string;
  description: string;
  isActive: boolean;
  isCollapsed: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
  children: ReactNode;
}

function ModuleShell({
  id,
  label,
  description,
  isActive,
  isCollapsed,
  onSelect,
  onToggleCollapse,
  children,
}: ModuleShellProps) {
  const bodyId = `mission-module-${id}`;

  return (
    <section className="app-surface overflow-hidden" data-mission-module={id}>
      <button
        type="button"
        onClick={isActive && !isCollapsed ? onToggleCollapse : onSelect}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        aria-expanded={isActive && !isCollapsed}
        aria-controls={bodyId}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            isActive
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'bg-white/5 text-slate-400'
          }`}
        >
          {label.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-100">{label}</span>
          <span className="block truncate text-xs text-slate-500">{description}</span>
        </span>
        <span
          className={`shrink-0 text-slate-500 transition-transform ${
            isActive && !isCollapsed ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {isActive && !isCollapsed ? (
        <div id={bodyId} className="border-t border-white/10 px-3 pb-3 pt-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export interface MobileMissionControlProps {
  portfolio: Portfolio;
  activeResult: SimulationResult;
  activeStrategy: StrategyId;
  portfolioYear: number;
  onYearChange: (year: number) => void;
  monthsToPayoff: number;
  cloudEnabled: boolean;
  userId?: string;
  missionHook: UseMobileMissionControlResult;
  timelineHook: UseTimelinePreferencesResult;
  onApplyTimelineEvents: (overlays: PropertyEventOverlay[]) => void;
  onClearTimelineEvents: () => void;
  sync: SyncBarProps;
  decisionPulseProps: React.ComponentProps<typeof DecisionPulse>;
  controlProps: React.ComponentProps<typeof Controls>;
  balloonSafetyProps: React.ComponentProps<typeof BalloonSafety>;
  payoffLandscapeProps: React.ComponentProps<typeof PayoffLandscape>;
  stressLabProps: React.ComponentProps<typeof StressLab>;
  principalVelocityProps: React.ComponentProps<typeof PrincipalVelocity>;
  playbookProps: React.ComponentProps<typeof PayoffPlaybook>;
  strategyLabProps: React.ComponentProps<typeof StrategyLab>;
  goalProps: React.ComponentProps<typeof GoalTracker>;
}

export function MobileMissionControl({
  portfolio,
  activeResult,
  activeStrategy,
  portfolioYear,
  onYearChange,
  monthsToPayoff,
  cloudEnabled,
  userId,
  missionHook,
  timelineHook,
  onApplyTimelineEvents,
  onClearTimelineEvents,
  sync,
  decisionPulseProps,
  controlProps,
  balloonSafetyProps,
  payoffLandscapeProps,
  stressLabProps,
  principalVelocityProps,
  playbookProps,
  strategyLabProps,
  goalProps,
}: MobileMissionControlProps) {
  const { preferences, setActiveModule, toggleModuleCollapsed, isModuleCollapsed } =
    missionHook;
  const moduleRefs = useRef<Partial<Record<MobileMissionModuleId, HTMLElement | null>>>({});

  const scrollToModule = useCallback((id: MobileMissionModuleId) => {
    void setActiveModule(id);
    requestAnimationFrame(() => {
      moduleRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [setActiveModule]);

  const renderModuleBody = (id: MobileMissionModuleId): ReactNode => {
    switch (id) {
      case 'pulse':
        return <DecisionPulse {...decisionPulseProps} embedded />;
      case 'assumptions':
        return (
          <Controls
            {...controlProps}
            mode="advanced"
            embedded
            idPrefix="mission-assumptions"
          />
        );
      case 'balloon':
        return <BalloonSafety {...balloonSafetyProps} embedded />;
      case 'landscape':
        return <PayoffLandscape {...payoffLandscapeProps} embedded />;
      case 'stress':
        return <StressLab {...stressLabProps} embedded />;
      case 'timeline':
        return (
          <TimelineStudio
            portfolio={portfolio}
            strategyId={activeStrategy}
            monthsToPayoff={monthsToPayoff}
            cloudEnabled={cloudEnabled}
            userId={userId}
            timelineHook={timelineHook}
            onApplyEvents={onApplyTimelineEvents}
            onClearEvents={onClearTimelineEvents}
            embedded
          />
        );
      case 'velocity':
        return <PrincipalVelocity {...principalVelocityProps} embedded />;
      case 'snapshot':
        return (
          <PortfolioDashboard
            portfolio={portfolio}
            result={activeResult}
            year={portfolioYear}
            onYearChange={onYearChange}
            compact
          />
        );
      case 'playbook':
        return <PayoffPlaybook {...playbookProps} embedded />;
      case 'lab':
        return <StrategyLab {...strategyLabProps} embedded />;
      case 'goals':
        return <GoalTracker {...goalProps} section="insights" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3" data-mobile-mission-control>
      <SyncBar {...sync} />

      <HeroStrip
        portfolio={portfolio}
        result={activeResult}
        strategyId={activeStrategy}
        show={preferences.showHeroStrip}
      />

      <nav
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none"
        aria-label="Mission modules"
      >
        {MOBILE_MISSION_MODULE_META.map((meta) => {
          const isActive = preferences.activeModule === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => scrollToModule(meta.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-cyan-600 text-white'
                  : 'border border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              {meta.shortLabel}
            </button>
          );
        })}
      </nav>

      <div className="space-y-2">
        {MOBILE_MISSION_MODULE_META.map((meta) => {
          const isActive = preferences.activeModule === meta.id;
          const collapsed = isModuleCollapsed(meta.id);

          return (
            <div
              key={meta.id}
              ref={(el) => {
                moduleRefs.current[meta.id] = el;
              }}
            >
              <ModuleShell
                id={meta.id}
                label={meta.label}
                description={meta.description}
                isActive={isActive}
                isCollapsed={collapsed}
                onSelect={() => void scrollToModule(meta.id)}
                onToggleCollapse={() => void toggleModuleCollapsed(meta.id)}
              >
                {renderModuleBody(meta.id)}
              </ModuleShell>
            </div>
          );
        })}
      </div>
    </div>
  );
}
