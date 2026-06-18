import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import { SCENARIO_PRESETS, buildSellScenario } from '../lib/snowball';
import {
  analyzeStressScenario,
  buildCustomScenario,
  computeStressPreviewDelta,
  formatImpactCurrency,
  impactDeltaLabel,
  impactToneClass,
  presetCategoryLabel,
  resolveScenarioFromId,
  scenariosEqual,
} from '../lib/stressLab';
import type { StressLabCustomKnobs } from '../lib/stressLabTypes';
import { CUSTOM_SCENARIO_ID } from '../lib/stressLabTypes';
import { formatCurrency, formatMonths, formatPercent } from '../lib/format';
import type { UseStressLabResult } from '../lib/useStressLab';
import { NumericInput } from './NumericInput';

interface StressLabProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  committedScenario: ScenarioConfig;
  customOrder?: string[] | null;
  stressHook: UseStressLabResult;
  onApplyScenario: (scenario: ScenarioConfig) => void;
  embedded?: boolean;
}

function PresetCard({
  analysis,
  isActive,
  isPreview,
  isPinned,
  onSelect,
  onPin,
}: {
  analysis: ReturnType<typeof analyzeStressScenario>;
  isActive: boolean;
  isPreview: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onPin: () => void;
}) {
  const { scenario, impact, severityScore } = analysis;
  const isBase = scenario.id === 'base';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex flex-col rounded-xl border p-3 text-left transition cursor-pointer ${
        isPreview
          ? 'border-amber-400/60 bg-amber-500/10 ring-1 ring-amber-400/30'
          : isActive
            ? 'border-cyan-500/50 bg-cyan-500/10'
            : 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {presetCategoryLabel(scenario)}
          </span>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-100">{scenario.label}</p>
        </div>
        {!isBase && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
              isPinned
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-slate-400'
            }`}
            title={isPinned ? 'Unpin preset' : 'Pin preset'}
          >
            {isPinned ? '★' : '☆'}
          </button>
        )}
      </div>

      {!isBase && (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          <span
            className={`rounded px-1.5 py-0.5 font-mono tabular-nums ${
              impact.monthsDelta > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {impactDeltaLabel(impact.monthsDelta)}
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono tabular-nums text-slate-400">
            {formatImpactCurrency(impact.interestDelta)} int.
          </span>
          {severityScore >= 30 && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-300">
              {severityScore}% severity
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StressLab({
  portfolio,
  activeStrategy,
  committedScenario,
  customOrder,
  stressHook,
  onApplyScenario,
  embedded = false,
}: StressLabProps) {
  const { preferences, setCollapsed, setLastExploredScenarioId, setPinnedPresetId, setShowSellScenarios, setCustomKnobs } =
    stressHook;

  const sellScenarios = useMemo(
    () => portfolio.properties.map((p) => buildSellScenario(p.name)),
    [portfolio.properties],
  );

  const [previewScenarioId, setPreviewScenarioId] = useState(committedScenario.id);
  const [customKnobs, setCustomKnobsLocal] = useState<StressLabCustomKnobs>(preferences.customKnobs);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setCustomKnobsLocal(preferences.customKnobs);
  }, [preferences.customKnobs]);

  useEffect(() => {
    if (!stressHook.loading && preferences.lastExploredScenarioId && committedScenario.id === 'base') {
      setPreviewScenarioId(preferences.lastExploredScenarioId);
    }
  }, [stressHook.loading, preferences.lastExploredScenarioId, committedScenario.id]);

  useEffect(() => {
    setPreviewScenarioId(committedScenario.id);
  }, [committedScenario.id]);

  const previewScenario = useMemo(
    () => resolveScenarioFromId(previewScenarioId, customKnobs, sellScenarios),
    [previewScenarioId, customKnobs, sellScenarios],
  );

  const deferredPreviewScenario = useDeferredValue(previewScenario);
  const isPreviewStale = !scenariosEqual(previewScenario, deferredPreviewScenario);
  const isDirty = !scenariosEqual(previewScenario, committedScenario);

  const committedAnalysis = useMemo(
    () => analyzeStressScenario(portfolio, activeStrategy, committedScenario, customOrder),
    [portfolio, activeStrategy, committedScenario, customOrder],
  );

  const previewAnalysis = useMemo(
    () => analyzeStressScenario(portfolio, activeStrategy, deferredPreviewScenario, customOrder),
    [portfolio, activeStrategy, deferredPreviewScenario, customOrder],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const previewDelta = useMemo(
    () =>
      isDirty
        ? computeStressPreviewDelta(
            portfolio,
            activeStrategy,
            committedScenario,
            deferredPreviewScenario,
            customOrder,
          )
        : null,
    [portfolio, activeStrategy, committedScenario, deferredPreviewScenario, customOrder, isDirty],
  );

  const presetAnalyses = useMemo(
    () =>
      SCENARIO_PRESETS.map((preset) =>
        analyzeStressScenario(portfolio, activeStrategy, preset, customOrder),
      ),
    [portfolio, activeStrategy, customOrder],
  );

  const handleSelectPreset = useCallback((scenarioId: string) => {
    setPreviewScenarioId(scenarioId);
  }, []);

  const handleCustomKnobChange = useCallback(
    (patch: Partial<StressLabCustomKnobs>) => {
      const next = { ...customKnobs, ...patch };
      setCustomKnobsLocal(next);
      setPreviewScenarioId(CUSTOM_SCENARIO_ID);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void setCustomKnobs(next);
      }, 500);
    },
    [customKnobs, setCustomKnobs],
  );

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    onApplyScenario(previewScenario);
    void setLastExploredScenarioId(previewScenario.id);
    if (previewScenarioId === CUSTOM_SCENARIO_ID) {
      void setCustomKnobs(customKnobs);
    }
  }, [
    isDirty,
    onApplyScenario,
    previewScenario,
    previewScenarioId,
    setLastExploredScenarioId,
    setCustomKnobs,
    customKnobs,
  ]);

  const handleReset = useCallback(() => {
    setPreviewScenarioId(committedScenario.id);
    setCustomKnobsLocal(preferences.customKnobs);
  }, [committedScenario.id, preferences.customKnobs]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isDirty) return undefined;
    debounceRef.current = setTimeout(() => {
      void setLastExploredScenarioId(previewScenarioId);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, previewScenarioId, setLastExploredScenarioId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-stress-lab]'))
      ) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Enter' && isDirty) {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApply, handleReset, isDirty]);

  const shell = embedded ? 'space-y-4' : 'glass-card overflow-hidden border-violet-500/20';

  if (preferences.isCollapsed) {
    return (
      <div className={shell} data-stress-lab>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
              Stress Test
            </p>
            <p className="truncate text-sm text-slate-200">{committedAnalysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Active scenario</p>
            <p className="text-sm font-medium text-slate-200">{committedScenario.label}</p>
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
      aria-label="Stress Test"
      data-stress-lab
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-400">
            Stress Test
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            See how bad times — higher vacancy, rising rates, a big repair, or selling a property —
            would change your debt-free date, equity, and cashflow. Preview before you apply.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setCollapsed(true)}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
          title="Collapse Stress Test"
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
              Exploring <span className="font-medium">{previewScenario.label}</span> — charts still
              use <span className="font-medium">{committedScenario.label}</span> until you apply.
            </p>
            {previewDelta && (
              <p className="mt-1 text-xs text-slate-400">
                Debt-free moves from {previewDelta.debtFreeLabelCommitted} to{' '}
                <span className="font-medium text-slate-200">{previewDelta.debtFreeLabelPreview}</span>
                {previewDelta.monthsDelta !== 0 && (
                  <>
                    {' '}
                    (
                    <span
                      className={
                        previewDelta.monthsDelta < 0 ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {impactDeltaLabel(previewDelta.monthsDelta)}
                    </span>
                    )
                  </>
                )}
                {previewDelta.interestDelta !== 0 && (
                  <>
                    {' '}
                    · interest {formatImpactCurrency(previewDelta.interestDelta)}
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
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
            >
              Apply scenario
            </button>
          </div>
        </div>
      )}

      <div
        className={`mx-4 mt-4 rounded-xl border px-4 py-3 transition-opacity ${impactToneClass(analysis.verdictTone)} ${
          isPreviewStale ? 'opacity-60' : 'opacity-100'
        }`}
      >
        <p className="text-sm leading-relaxed text-slate-100">{analysis.verdict}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Debt-free</dt>
            <dd className="font-mono tabular-nums text-slate-200">
              {formatMonths(analysis.impact.monthsToPayoff)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">vs base</dt>
            <dd
              className={`font-mono tabular-nums ${
                analysis.impact.monthsDelta > 0
                  ? 'text-amber-300'
                  : analysis.impact.monthsDelta < 0
                    ? 'text-emerald-300'
                    : 'text-slate-200'
              }`}
            >
              {impactDeltaLabel(analysis.impact.monthsDelta)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Y15 equity</dt>
            <dd className="font-mono tabular-nums text-slate-200">
              {formatCurrency(analysis.impact.equityAtYear15)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Y1 cashflow</dt>
            <dd className="font-mono tabular-nums text-slate-200">
              {formatCurrency(analysis.impact.monthlyCashflowYear1)}/mo
            </dd>
          </div>
        </dl>
      </div>

      <div className="mx-4 mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stress presets
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {presetAnalyses.map((presetAnalysis) => (
            <PresetCard
              key={presetAnalysis.scenario.id}
              analysis={presetAnalysis}
              isActive={committedScenario.id === presetAnalysis.scenario.id && !isDirty}
              isPreview={previewScenarioId === presetAnalysis.scenario.id && isDirty}
              isPinned={preferences.pinnedPresetId === presetAnalysis.scenario.id}
              onSelect={() => handleSelectPreset(presetAnalysis.scenario.id)}
              onPin={() =>
                void setPinnedPresetId(
                  preferences.pinnedPresetId === presetAnalysis.scenario.id
                    ? null
                    : presetAnalysis.scenario.id,
                )
              }
            />
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Custom stress knobs
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Vacancy {formatPercent(customKnobs.vacancy)}
            </label>
            <input
              type="range"
              min={0}
              max={0.25}
              step={0.01}
              value={customKnobs.vacancy}
              onChange={(e) => handleCustomKnobChange({ vacancy: Number(e.target.value) })}
              className="h-2 w-full accent-violet-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Capex reserve {formatPercent(customKnobs.capex)}
            </label>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.005}
              value={customKnobs.capex}
              onChange={(e) => handleCustomKnobChange({ capex: Number(e.target.value) })}
              className="h-2 w-full accent-violet-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Rate shock {formatPercent(customKnobs.rateShock)}
            </label>
            <input
              type="range"
              min={0}
              max={0.03}
              step={0.005}
              value={customKnobs.rateShock}
              onChange={(e) => handleCustomKnobChange({ rateShock: Number(e.target.value) })}
              className="h-2 w-full accent-violet-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Pause extra payments (months)
            </label>
            <NumericInput
              value={customKnobs.pauseMonths}
              onChange={(v) => handleCustomKnobChange({ pauseMonths: v ?? 0 })}
              min={0}
              max={60}
              className="w-full rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-sm text-slate-100"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleSelectPreset(CUSTOM_SCENARIO_ID)}
          className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs transition ${
            previewScenarioId === CUSTOM_SCENARIO_ID
              ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
              : 'border-white/10 text-slate-400 hover:bg-white/5'
          }`}
        >
          Preview custom scenario
        </button>
      </div>

      <div className="mx-4 mt-4 mb-4">
        <button
          type="button"
          onClick={() => void setShowSellScenarios(!preferences.showSellScenarios)}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5"
        >
          <span>Exit scenarios ({sellScenarios.length} properties)</span>
          <span>{preferences.showSellScenarios ? '▲' : '▼'}</span>
        </button>
        {preferences.showSellScenarios && (
          <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {sellScenarios.map((sell) => {
              const sellAnalysis = analyzeStressScenario(
                portfolio,
                activeStrategy,
                sell,
                customOrder,
              );
              return (
                <PresetCard
                  key={sell.id}
                  analysis={sellAnalysis}
                  isActive={committedScenario.id === sell.id && !isDirty}
                  isPreview={previewScenarioId === sell.id && isDirty}
                  isPinned={preferences.pinnedPresetId === sell.id}
                  onSelect={() => handleSelectPreset(sell.id)}
                  onPin={() =>
                    void setPinnedPresetId(
                      preferences.pinnedPresetId === sell.id ? null : sell.id,
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
