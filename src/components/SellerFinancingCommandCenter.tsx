import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio, Property } from '../lib/types';
import {
  applyFinancingPatch,
  deriveTermsFromPayoffCap,
  validatePropertyFinancing,
  type FinancingType,
  type PropertyFinancingPatch,
} from '../lib/propertyFinancing';
import {
  applyPresetPatch,
  buildAmortizationWaterfall,
  buildPreviewProperty,
  computeSellerFinancingAnalysis,
  computeSellerFinancingPreviewDelta,
  extractDirtyFinancingPatch,
  financingPatchIsDirty,
  SELLER_FINANCING_PRESETS,
} from '../lib/sellerFinancing';
import type { SellerFinancingPresetId, SellerFinancingStatusTone } from '../lib/sellerFinancingTypes';
import { formatCurrency, formatMonths, formatPercent } from '../lib/format';
import type { UseSellerFinancingResult } from '../lib/useSellerFinancing';
import { NumericInput } from './NumericInput';

interface SellerFinancingCommandCenterProps {
  property: Property;
  portfolio: Portfolio;
  asOfMonth: number;
  sellerFinancingHook: UseSellerFinancingResult;
  onApplyFinancing: (patch: PropertyFinancingPatch) => void;
  embedded?: boolean;
}

function statusToneClass(tone: SellerFinancingStatusTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-violet-500/30 bg-violet-500/10';
}

function urgencyClass(urgency: 'none' | 'info' | 'warning' | 'critical'): string {
  if (urgency === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-200';
  if (urgency === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (urgency === 'info') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
  return 'border-white/10 bg-white/[0.02] text-slate-300';
}

function AmortizationSparkline({
  points,
  balloonMonth,
}: {
  points: { month: number; balance: number }[];
  balloonMonth: number | null;
}) {
  if (points.length === 0) return null;
  const maxBalance = Math.max(...points.map((p) => p.balance), 1);
  const width = 280;
  const height = 48;

  const path = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * width;
      const y = height - (p.balance / maxBalance) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const balloonX =
    balloonMonth != null && points.length > 1
      ? (Math.min(balloonMonth, points.length) / (points.length - 1)) * width
      : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-12 w-full text-violet-400"
      aria-hidden
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {balloonX != null && (
        <line
          x1={balloonX}
          y1={0}
          x2={balloonX}
          y2={height}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 2"
          opacity={0.5}
        />
      )}
    </svg>
  );
}

export function SellerFinancingCommandCenter({
  property,
  portfolio,
  asOfMonth,
  sellerFinancingHook,
  onApplyFinancing,
  embedded = true,
}: SellerFinancingCommandCenterProps) {
  const committed = property;
  const {
    preferences,
    setCollapsed,
    setEntryMode,
    setLastExploredPreset,
    setShowAmortizationChart,
    setShowRefiImpact,
  } = sellerFinancingHook;

  const [previewPatch, setPreviewPatch] = useState<PropertyFinancingPatch>({});
  const sectionRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreviewPatch({});
  }, [committed.name, committed.balance, committed.financingType]);

  const previewProperty = useMemo(
    () => buildPreviewProperty(committed, previewPatch),
    [committed, previewPatch],
  );

  const deferredPreview = useDeferredValue(previewProperty);
  const isPreviewStale = previewProperty !== deferredPreview;
  const isDirty = financingPatchIsDirty(committed, previewProperty);

  const committedAnalysis = useMemo(
    () => computeSellerFinancingAnalysis(committed, portfolio, asOfMonth),
    [committed, portfolio, asOfMonth],
  );

  const previewAnalysis = useMemo(
    () => computeSellerFinancingAnalysis(deferredPreview, portfolio, asOfMonth),
    [deferredPreview, portfolio, asOfMonth],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const previewDelta = useMemo(
    () =>
      isDirty
        ? computeSellerFinancingPreviewDelta(committed, deferredPreview, portfolio, asOfMonth)
        : null,
    [committed, deferredPreview, portfolio, asOfMonth, isDirty],
  );

  const issues = useMemo(() => validatePropertyFinancing(previewProperty), [previewProperty]);

  const financingType =
    previewProperty.financingType ??
    (previewProperty.balloonMonths != null ? 'seller' : 'conventional');

  const waterfall = useMemo(() => {
    if (!preferences.showAmortizationChart || financingType !== 'seller') return [];
    const span = previewProperty.balloonMonths ?? 60;
    return buildAmortizationWaterfall(previewProperty, span);
  }, [preferences.showAmortizationChart, financingType, previewProperty]);

  const patchField = useCallback((patch: PropertyFinancingPatch) => {
    setPreviewPatch((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    const patch = extractDirtyFinancingPatch(committed, previewProperty);
    onApplyFinancing(patch);
    setPreviewPatch({});
  }, [committed, isDirty, onApplyFinancing, previewProperty]);

  const handleReset = useCallback(() => {
    setPreviewPatch({});
  }, []);

  const handleDeriveFromCap = useCallback(() => {
    const terms = deriveTermsFromPayoffCap(previewProperty);
    if (!terms) return;
    patchField({ balance: terms.balance, monthlyPayment: terms.monthlyPayment });
  }, [patchField, previewProperty]);

  const handlePreset = useCallback(
    (presetId: SellerFinancingPresetId) => {
      const patch = applyPresetPatch(presetId, previewProperty);
      setPreviewPatch((prev) => ({ ...prev, ...patch }));
      void setLastExploredPreset(presetId);
    },
    [previewProperty, setLastExploredPreset],
  );

  const handleTypeChange = useCallback(
    (type: FinancingType) => {
      patchField({ financingType: type });
    },
    [patchField],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isDirty) return undefined;
    debounceRef.current = setTimeout(() => {
      const preset = preferences.lastExploredPreset;
      if (preset) void setLastExploredPreset(preset);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, preferences.lastExploredPreset, setLastExploredPreset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-seller-financing]'))
      ) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Enter' && isDirty && previewAnalysis.errorCount === 0) {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApply, handleReset, isDirty, previewAnalysis.errorCount]);

  if (!embedded && preferences.isCollapsed) {
    return (
      <div className="glass-card overflow-hidden border-violet-500/20" data-seller-financing>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
              Seller Financing
            </p>
            <p className="truncate text-sm text-slate-200">{committedAnalysis.statusHeadline}</p>
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  const shell = embedded
    ? 'rounded-lg border border-white/10 bg-slate-950/60'
    : 'glass-card overflow-hidden border-violet-500/20';

  return (
    <div
      ref={sectionRef}
      className={shell}
      data-seller-financing
      aria-label="Seller Financing"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-400">
            Seller Financing
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Balloon timing and what the loan looks like after it refinances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(['conventional', 'seller'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                  financingType === type
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          {!embedded && (
            <button
              type="button"
              onClick={() => void setCollapsed(true)}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
            >
              Collapse
            </button>
          )}
        </div>
      </div>

      {isDirty && (
        <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Preview mode
            </p>
            <p className="mt-0.5 text-xs text-slate-100">
              Exploring changes — portfolio still uses committed terms until you apply.
            </p>
            {previewDelta && previewDelta.refiPaymentDelta != null && previewDelta.refiPaymentDelta !== 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Post-refi P&I{' '}
                <span
                  className={
                    previewDelta.refiPaymentDelta > 0 ? 'text-amber-400' : 'text-emerald-400'
                  }
                >
                  {previewDelta.refiPaymentDelta > 0 ? '+' : ''}
                  {formatCurrency(previewDelta.refiPaymentDelta)}/mo
                </span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={previewAnalysis.errorCount > 0}
              className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              Apply terms
            </button>
          </div>
        </div>
      )}

      <div
        className={`mx-3 mt-3 rounded-xl border px-3 py-2.5 transition-opacity ${statusToneClass(analysis.statusTone)} ${
          isPreviewStale ? 'opacity-60' : 'opacity-100'
        }`}
      >
        <p className="text-sm font-medium text-slate-100">{analysis.statusHeadline}</p>
        <p className="mt-1 text-xs text-slate-400">{analysis.statusDetail}</p>
      </div>

      {financingType === 'seller' ? (
        <>
          <div className="mx-3 mt-3 flex flex-wrap gap-1.5">
            {SELLER_FINANCING_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePreset(preset.id)}
                title={preset.description}
                className={`rounded-lg border px-2 py-1 text-[10px] transition ${
                  preferences.lastExploredPreset === preset.id
                    ? 'border-violet-500/50 bg-violet-600/20 text-violet-200'
                    : 'border-white/10 text-slate-400 hover:border-violet-500/30 hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mx-3 mt-2 flex gap-1">
            {(['cap_driven', 'balance_driven'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void setEntryMode(mode)}
                className={`rounded-md px-2 py-0.5 text-[10px] ${
                  preferences.entryMode === mode
                    ? 'bg-slate-800 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === 'cap_driven' ? 'Cap-first' : 'Balance-first'}
              </button>
            ))}
          </div>

          <div className="mx-3 mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(preferences.entryMode === 'cap_driven' ||
              previewProperty.sellerPayoffCap != null) && (
              <label className="block text-xs text-slate-400">
                <span className="mb-1 block">Seller payoff cap ($)</span>
                <NumericInput
                  value={previewProperty.sellerPayoffCap ?? 0}
                  onChange={(n) => patchField({ sellerPayoffCap: n ?? 0 })}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  Yield-maintenance: cap minus P&I paid
                </span>
              </label>
            )}
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">Balloon term (months)</span>
              <NumericInput
                value={previewProperty.balloonMonths ?? 60}
                onChange={(n) => patchField({ balloonMonths: n ?? 60 })}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">Amortization (months)</span>
              <NumericInput
                value={previewProperty.sellerAmortizationMonths ?? 240}
                onChange={(n) => patchField({ sellerAmortizationMonths: n ?? 240 })}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            {(preferences.entryMode === 'balance_driven' ||
              previewProperty.balance > 0) && (
              <>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Opening balance ($)</span>
                  <NumericInput
                    value={previewProperty.balance}
                    onChange={(n) => patchField({ balance: n ?? 0 })}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Monthly P&I ($)</span>
                  <NumericInput
                    value={previewProperty.monthlyPayment}
                    onChange={(n) => patchField({ monthlyPayment: n ?? 0 })}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              </>
            )}
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">Post-balloon refi rate</span>
              <NumericInput
                value={
                  previewProperty.balloonRefiAnnualRate ??
                  portfolio.defaultRefiAnnualRate ??
                  0.065
                }
                onChange={(n) => patchField({ balloonRefiAnnualRate: n ?? 0.065 })}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">Post-balloon refi term (mo)</span>
              <NumericInput
                value={
                  previewProperty.balloonRefiTermMonths ??
                  portfolio.defaultRefiTermMonths ??
                  360
                }
                onChange={(n) => patchField({ balloonRefiTermMonths: n ?? 360 })}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">Seller credit at close ($)</span>
              <NumericInput
                value={previewProperty.sellerCredit ?? 0}
                onChange={(n) => patchField({ sellerCredit: n ?? 0 })}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
            {preferences.entryMode === 'cap_driven' && (
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  onClick={handleDeriveFromCap}
                  disabled={!previewProperty.sellerPayoffCap}
                  className="rounded-lg border border-violet-500/30 bg-violet-600/20 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-600/30 disabled:opacity-40"
                >
                  Derive balance &amp; P&I from payoff cap
                </button>
              </div>
            )}
          </div>

          {preferences.showAmortizationChart && waterfall.length > 0 && (
            <div className="mx-3 mt-3 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Balance through balloon
                </p>
                <button
                  type="button"
                  onClick={() => void setShowAmortizationChart(false)}
                  className="text-[10px] text-slate-600 hover:text-slate-400"
                >
                  Hide
                </button>
              </div>
              <AmortizationSparkline
                points={waterfall}
                balloonMonth={previewProperty.balloonMonths ?? null}
              />
            </div>
          )}

          {preferences.showRefiImpact && analysis.refiPaymentEstimate != null && (
            <div
              className={`mx-3 mt-3 rounded-lg border p-3 ${urgencyClass(
                analysis.monthsUntilBalloon != null && analysis.monthsUntilBalloon <= 12
                  ? 'critical'
                  : analysis.monthsUntilBalloon != null && analysis.monthsUntilBalloon <= 24
                    ? 'warning'
                    : 'info',
              )}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                  Post-refi impact
                </p>
                <button
                  type="button"
                  onClick={() => void setShowRefiImpact(false)}
                  className="text-[10px] opacity-60 hover:opacity-100"
                >
                  Hide
                </button>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                {analysis.balloonBalanceEstimate != null && (
                  <div>
                    <p className="text-[10px] uppercase opacity-70">Est. balloon balance</p>
                    <p className="font-mono font-medium tabular-nums">
                      {formatCurrency(analysis.balloonBalanceEstimate)}
                    </p>
                  </div>
                )}
                {analysis.aggregatePiAtBalloon != null && (
                  <div>
                    <p className="text-[10px] uppercase opacity-70">P&I through balloon</p>
                    <p className="font-mono font-medium tabular-nums">
                      {formatCurrency(analysis.aggregatePiAtBalloon)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase opacity-70">Current P&I</p>
                  <p className="font-mono font-medium tabular-nums">
                    {formatCurrency(analysis.monthlyPayment)}/mo
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase opacity-70">Post-refi P&I est.</p>
                  <p className="font-mono font-medium tabular-nums">
                    {formatCurrency(analysis.refiPaymentEstimate)}/mo
                    {analysis.refiPaymentEstimate > analysis.monthlyPayment && (
                      <span className="ml-1 text-amber-300">
                        (+{formatCurrency(analysis.refiPaymentEstimate - analysis.monthlyPayment)})
                      </span>
                    )}
                  </p>
                </div>
                {analysis.monthsUntilBalloon != null && (
                  <div>
                    <p className="text-[10px] uppercase opacity-70">Balloon clock</p>
                    <p className="font-medium">{formatMonths(analysis.monthsUntilBalloon)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase opacity-70">Refi rate</p>
                  <p className="font-mono">
                    {formatPercent(
                      previewProperty.balloonRefiAnnualRate ??
                        portfolio.defaultRefiAnnualRate ??
                        0.065,
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="mx-3 mt-3 mb-3 text-xs text-slate-500">
          Conventional amortizing loan — edit balance and P&I in the property table. Switch to
          seller for note terms, yield-maintenance caps, and balloon refi modeling.
        </p>
      )}

      {issues.length > 0 && (
        <ul className="mx-3 mb-3 mt-2 space-y-1">
          {issues.map((issue, i) => (
            <li
              key={`${issue.field}-${i}`}
              className={`text-[11px] ${
                issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'
              }`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <p className="mx-3 mb-3 text-[10px] text-slate-600">
        Enter to apply · Esc to reset preview · Cap-first derives P&I from yield-maintenance math
      </p>
    </div>
  );
}

export { applyFinancingPatch };
