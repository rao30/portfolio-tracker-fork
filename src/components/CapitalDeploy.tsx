import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  computeCapitalDeployAnalysis,
  computeCapitalDeployPreviewDelta,
  laneToneClass,
  verdictToneClass,
} from '../lib/capitalDeploy';
import type { DeployLane } from '../lib/capitalDeployTypes';
import { formatCurrency, formatPercent } from '../lib/format';
import type { UseCapitalDeployResult } from '../lib/useCapitalDeploy';
import { NumericInput } from './NumericInput';

interface CapitalDeployProps {
  portfolio: Portfolio;
  activeStrategy: StrategyId;
  customOrder?: string[] | null;
  deployMax: number;
  deployHook: UseCapitalDeployResult;
  embedded?: boolean;
}

const LANE_ICONS: Record<DeployLane, string> = {
  paydown: '⚡',
  reserve: '🛡',
  acquisition: '🎯',
};

function LaneCard({
  lane,
  isPinned,
  onPin,
}: {
  lane: ReturnType<typeof computeCapitalDeployAnalysis>['lanes'][number];
  isPinned: boolean;
  onPin: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border p-4 transition ${laneToneClass(lane.lane, lane.isWinner)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-lg" aria-hidden>
            {LANE_ICONS[lane.lane]}
          </span>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {lane.label}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-100">{lane.headline}</p>
        </div>
        <button
          type="button"
          onClick={onPin}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
            isPinned
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'text-slate-600 hover:bg-white/5 hover:text-slate-400'
          }`}
          title={isPinned ? 'Unpin lane' : 'Pin lane'}
        >
          {isPinned ? '★' : '☆'}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{lane.subline}</p>
      {lane.isWinner && (
        <span className="mt-3 inline-flex w-fit rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
          Recommended
        </span>
      )}
    </div>
  );
}

export function CapitalDeploy({
  portfolio,
  activeStrategy,
  customOrder,
  deployMax,
  deployHook,
  embedded = false,
}: CapitalDeployProps) {
  const {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setTargetReserveMonths,
    setAcquisitionCocHurdle,
    setLastExploredDeployAmount,
    setPinnedLane,
  } = deployHook;

  const committedDeploy =
    preferences.lastExploredDeployAmount ?? Math.min(200, deployMax);

  const [previewDeploy, setPreviewDeploy] = useState(committedDeploy);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setPreviewDeploy(committedDeploy);
  }, [committedDeploy]);

  const deferredDeploy = useDeferredValue(previewDeploy);
  const isPreviewStale = previewDeploy !== deferredDeploy;
  const isDirty = previewDeploy !== committedDeploy;

  const analysisOptions = useMemo(
    () => ({
      targetReserveMonths: preferences.targetReserveMonths,
      acquisitionCocHurdle: preferences.acquisitionCocHurdle,
      pinnedLane: preferences.pinnedLane,
    }),
    [
      preferences.targetReserveMonths,
      preferences.acquisitionCocHurdle,
      preferences.pinnedLane,
    ],
  );

  const committedAnalysis = useMemo(
    () =>
      computeCapitalDeployAnalysis(portfolio, activeStrategy, customOrder, {
        ...analysisOptions,
        deployAmount: committedDeploy,
      }),
    [portfolio, activeStrategy, customOrder, analysisOptions, committedDeploy],
  );

  const previewAnalysis = useMemo(
    () =>
      computeCapitalDeployAnalysis(portfolio, activeStrategy, customOrder, {
        ...analysisOptions,
        deployAmount: deferredDeploy,
      }),
    [portfolio, activeStrategy, customOrder, analysisOptions, deferredDeploy],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const previewDelta = useMemo(
    () =>
      computeCapitalDeployPreviewDelta(
        portfolio,
        activeStrategy,
        customOrder,
        committedDeploy,
        deferredDeploy,
        analysisOptions,
      ),
    [portfolio, activeStrategy, customOrder, committedDeploy, deferredDeploy, analysisOptions],
  );

  const handlePreviewChange = useCallback(
    (value: number) => {
      const stepped =
        Math.round(
          Math.min(deployMax, Math.max(0, value)) / preferences.deployStep,
        ) * preferences.deployStep;
      setPreviewDeploy(stepped);
    },
    [deployMax, preferences.deployStep],
  );

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    void setLastExploredDeployAmount(previewDeploy);
  }, [isDirty, previewDeploy, setLastExploredDeployAmount]);

  const handleReset = useCallback(() => {
    setPreviewDeploy(committedDeploy);
  }, [committedDeploy]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isDirty) return undefined;
    debounceRef.current = setTimeout(() => {
      void setLastExploredDeployAmount(previewDeploy);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, previewDeploy, setLastExploredDeployAmount]);

  const shell = embedded ? 'space-y-4' : 'glass-card overflow-hidden border-violet-500/20';

  if (preferences.isCollapsed) {
    return (
      <div className={shell} data-capital-deploy>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
              Capital Deploy
            </p>
            <p className="truncate text-sm text-slate-200">{committedAnalysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Winner</p>
            <p className="text-sm font-medium capitalize text-slate-200">
              {committedAnalysis.winner}
            </p>
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  const { liquidity } = analysis;

  return (
    <section
      ref={sectionRef}
      className={shell}
      aria-label="Capital Deploy command center"
      data-capital-deploy
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
            Capital Deploy
          </p>
          <h2 className="text-base font-semibold text-slate-100">
            Where should the next dollar go?
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Compare paydown vs reserves vs acquisition — the decision every investor faces.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cloudBacked && (
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
              Synced
            </span>
          )}
          {saving && (
            <span className="text-[10px] text-slate-500">Saving…</span>
          )}
          <button
            type="button"
            onClick={() => void setCollapsed(true)}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300"
          >
            Collapse
          </button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div
          className={`rounded-xl border p-4 ${verdictToneClass(analysis.verdictTone)}`}
        >
          <p className="text-sm font-medium text-slate-100">{analysis.verdict}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>
              Surplus{' '}
              <span className="font-mono text-slate-200">
                {formatCurrency(liquidity.monthlySurplus)}/mo
              </span>
            </span>
            <span>
              Runway{' '}
              <span className="font-mono text-slate-200">
                {liquidity.reserveRunwayMonths.toFixed(1)} mo
              </span>
            </span>
            <span>
              Avg rate{' '}
              <span className="font-mono text-slate-200">
                {formatPercent(liquidity.weightedAvgMortgageRate)}
              </span>
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Operating burn</p>
            <p className="mt-1 font-mono text-lg text-slate-100">
              {formatCurrency(liquidity.operatingBurn)}
              <span className="text-sm text-slate-500">/mo</span>
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Cash reserve</p>
            <p className="mt-1 font-mono text-lg text-slate-100">
              {formatCurrency(liquidity.cashReserve)}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Safe extra ceiling</p>
            <p className="mt-1 font-mono text-lg text-emerald-300">
              {formatCurrency(analysis.safeExtraBudgetCeiling)}
              <span className="text-sm text-slate-500">/mo</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400">
                Monthly deploy preview
              </label>
              <p className="text-[10px] text-slate-600">
                Scrub to see how each lane responds — Enter to commit preview
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NumericInput
                value={previewDeploy}
                onChange={(v) => handlePreviewChange(v ?? 0)}
                min={0}
                max={deployMax}
                className="w-28"
              />
              <span className="text-xs text-slate-500">/mo</span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={deployMax}
            step={preferences.deployStep}
            value={previewDeploy}
            onChange={(e) => handlePreviewChange(Number(e.target.value))}
            onMouseDown={() => setIsScrubbing(true)}
            onMouseUp={() => setIsScrubbing(false)}
            onTouchStart={() => setIsScrubbing(true)}
            onTouchEnd={() => setIsScrubbing(false)}
            className="mt-3 w-full accent-violet-500"
            aria-label="Monthly deploy amount preview"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
            {isDirty && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">
                Preview — not committed
              </span>
            )}
            {isPreviewStale && isScrubbing && (
              <span className="text-slate-500">Calculating…</span>
            )}
            {previewDelta.winnerChanged && isDirty && (
              <span className="rounded bg-violet-500/15 px-2 py-0.5 text-violet-300">
                Winner shifts to {previewDelta.winnerPreview}
              </span>
            )}
            {isDirty && (
              <>
                <button
                  type="button"
                  onClick={handleApply}
                  className="rounded bg-violet-600 px-2 py-0.5 text-white hover:bg-violet-500"
                >
                  Commit preview
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded px-2 py-0.5 text-slate-400 hover:bg-white/5"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>

        {preferences.showLaneComparison && (
          <div className="grid gap-3 md:grid-cols-3">
            {analysis.lanes.map((lane) => (
              <LaneCard
                key={lane.lane}
                lane={lane}
                isPinned={preferences.pinnedLane === lane.lane}
                onPin={() =>
                  void setPinnedLane(
                    preferences.pinnedLane === lane.lane ? null : lane.lane,
                  )
                }
              />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Acquisition war chest
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[10px] text-slate-600">Down payment target</p>
              <p className="font-mono text-sm text-slate-200">
                {formatCurrency(analysis.acquisitionDownPayment)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Template CoC</p>
              <p className="font-mono text-sm text-slate-200">
                {formatPercent(analysis.acquisitionCocFromTemplate)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Fund progress</p>
              <p className="font-mono text-sm text-slate-200">
                {Math.round(analysis.acquisitionFundProgress * 100)}%
              </p>
            </div>
            {analysis.monthsToAcquisitionFund != null && (
              <div>
                <p className="text-[10px] text-slate-600">Months to fund</p>
                <p className="font-mono text-sm text-cyan-300">
                  {analysis.monthsToAcquisitionFund.toFixed(0)} mo
                </p>
              </div>
            )}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all"
              style={{ width: `${analysis.acquisitionFundProgress * 100}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <label className="text-xs text-slate-400">Reserve target (months)</label>
            <NumericInput
              value={preferences.targetReserveMonths}
              onChange={(v) => void setTargetReserveMonths(v ?? 6)}
              min={1}
              max={24}
              className="mt-1"
            />
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <label className="text-xs text-slate-400">Acquisition CoC hurdle</label>
            <NumericInput
              value={preferences.acquisitionCocHurdle}
              onChange={(v) => void setAcquisitionCocHurdle(v ?? 0.08)}
              min={0}
              max={0.5}
              allowDecimal
              className="mt-1"
            />
          </div>
        </div>

        {loading && (
          <div className="animate-pulse space-y-2">
            <div className="h-16 rounded-lg bg-white/5" />
            <div className="h-24 rounded-lg bg-white/5" />
          </div>
        )}
      </div>
    </section>
  );
}
