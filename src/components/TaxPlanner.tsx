import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio, TaxProfile } from '../lib/types';
import {
  computeTaxPlannerResult,
  type PropertyTaxLoss,
} from '../lib/tax';
import {
  buildPreviewTaxProfile,
  computeTaxShieldAnalysis,
  computeTaxShieldPreviewDelta,
  extractDirtyPatch,
  taxProfilePatchIsDirty,
} from '../lib/taxShield';
import type { TaxShieldStatusTone } from '../lib/taxShieldTypes';
import { formatCurrency, formatPercent } from '../lib/format';
import type { UseTaxShieldResult } from '../lib/useTaxShield';
import { NumericInput } from './NumericInput';

interface TaxPlannerProps {
  portfolio: Portfolio;
  taxShieldHook: UseTaxShieldResult;
  onApplyTaxProfile: (patch: Partial<TaxProfile>) => void;
  embedded?: boolean;
}

const W2_MAX = 2_000_000;
const CARRYOVER_MAX = 2_000_000;

function statusToneClass(tone: TaxShieldStatusTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-violet-500/30 bg-violet-500/10';
}

function TaxBarChart({
  w2,
  offset,
  remaining,
}: {
  w2: number;
  offset: number;
  remaining: number;
}) {
  const total = w2 || 1;
  const offsetPct = Math.min(100, (offset / total) * 100);
  const remainPct = Math.min(100 - offsetPct, (remaining / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {offsetPct > 0 && (
          <div className="bg-emerald-500/80" style={{ width: `${offsetPct}%` }} />
        )}
        {remainPct > 0 && (
          <div className="bg-amber-500/80" style={{ width: `${remainPct}%` }} />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span className="text-emerald-400">Shielded by rental losses</span>
        <span className="text-amber-400">Taxable remainder</span>
      </div>
    </div>
  );
}

function PropertyTaxTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: PropertyTaxLoss[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/30 p-4">
      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
      <p className="mb-3 text-xs text-slate-500">{subtitle}</p>
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="pb-2 pr-2 font-medium">Property</th>
            <th className="pb-2 pr-2 font-medium">Depreciation</th>
            <th className="pb-2 pr-2 font-medium">Bonus</th>
            <th className="pb-2 pr-2 font-medium">Interest</th>
            <th className="pb-2 pr-2 font-medium">Net rent</th>
            <th className="pb-2 font-medium">Tax loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name} className="border-b border-white/5 text-slate-200">
              <td className="py-2 pr-2">{p.name}</td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(p.depreciation.total)}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums text-cyan-300">
                {p.depreciation.bonus > 0 ? formatCurrency(p.depreciation.bonus) : '—'}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(p.mortgageInterest)}
              </td>
              <td className="py-2 pr-2 font-mono tabular-nums">
                {formatCurrency(p.grossRent - p.operatingExpenses - p.mortgageInterest)}
              </td>
              <td className="py-2 font-mono tabular-nums text-emerald-400">
                {formatCurrency(Math.max(0, p.netTaxableLoss))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TaxPlanner({
  portfolio,
  taxShieldHook,
  onApplyTaxProfile,
  embedded = false,
}: TaxPlannerProps) {
  const committed = portfolio.taxProfile;
  const {
    preferences,
    setCollapsed,
    setLastExploredW2Income,
    setLastExploredCarryover,
    setShowPropertyBreakdown,
  } = taxShieldHook;
  const incomeStep = preferences.incomeStep;

  const [previewPatch, setPreviewPatch] = useState<Partial<TaxProfile>>({});
  const sectionRef = useRef<HTMLElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreviewPatch({});
  }, [committed]);

  const previewProfile = useMemo(
    () => buildPreviewTaxProfile(committed, previewPatch),
    [committed, previewPatch],
  );

  const deferredPreview = useDeferredValue(previewProfile);
  const isPreviewStale = previewProfile !== deferredPreview;
  const isDirty = taxProfilePatchIsDirty(committed, previewProfile);

  const committedAnalysis = useMemo(
    () => computeTaxShieldAnalysis(portfolio, committed),
    [portfolio, committed],
  );

  const previewAnalysis = useMemo(
    () => computeTaxShieldAnalysis(portfolio, deferredPreview),
    [portfolio, deferredPreview],
  );

  const analysis = isDirty ? previewAnalysis : committedAnalysis;

  const taxResult = useMemo(
    () =>
      computeTaxPlannerResult({
        ...portfolio,
        taxProfile: isDirty ? deferredPreview : committed,
      }),
    [portfolio, committed, deferredPreview, isDirty],
  );

  const previewDelta = useMemo(
    () =>
      isDirty
        ? computeTaxShieldPreviewDelta(portfolio, committed, deferredPreview)
        : null,
    [portfolio, committed, deferredPreview, isDirty],
  );

  const updatePreview = useCallback((patch: Partial<TaxProfile>) => {
    setPreviewPatch((current) => ({ ...current, ...patch }));
  }, []);

  const previewW2 = previewProfile.annualW2Income;
  const previewCarryover = previewProfile.remainingBonusCarryover;

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    const patch = extractDirtyPatch(committed, previewProfile);
    onApplyTaxProfile(patch);
    setPreviewPatch({});
    void setLastExploredW2Income(previewProfile.annualW2Income);
    void setLastExploredCarryover(previewProfile.remainingBonusCarryover);
  }, [
    isDirty,
    committed,
    previewProfile,
    onApplyTaxProfile,
    setLastExploredW2Income,
    setLastExploredCarryover,
  ]);

  const handleReset = useCallback(() => {
    setPreviewPatch({});
  }, []);

  const handleW2Change = useCallback(
    (value: number) => {
      const clamped = Math.min(W2_MAX, Math.max(0, value));
      const stepped = Math.round(clamped / incomeStep) * incomeStep;
      updatePreview({ annualW2Income: stepped });
    },
    [incomeStep, updatePreview],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isDirty) return undefined;
    debounceRef.current = setTimeout(() => {
      void setLastExploredW2Income(previewW2);
      void setLastExploredCarryover(previewCarryover);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, previewW2, previewCarryover, setLastExploredW2Income, setLastExploredCarryover]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-tax-shield]'))
      ) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleW2Change(previewW2 + incomeStep);
      } else if (e.key === '-') {
        e.preventDefault();
        handleW2Change(previewW2 - incomeStep);
      } else if (e.key === 'Enter' && isDirty) {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleReset();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        updatePreview({ spouseIsReps: !previewProfile.spouseIsReps });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    handleApply,
    handleReset,
    handleW2Change,
    incomeStep,
    isDirty,
    previewProfile.spouseIsReps,
    previewW2,
    updatePreview,
  ]);

  const shell = embedded
    ? 'space-y-4'
    : 'glass-card overflow-hidden border-violet-500/20';

  const tp = isDirty ? deferredPreview : committed;

  if (preferences.isCollapsed) {
    return (
      <div className={shell} data-tax-shield>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
              Tax Savings
            </p>
            <p className="truncate text-sm text-slate-200">{committedAnalysis.statusHeadline}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Saves</p>
            <p className="text-sm font-medium text-emerald-400">
              {formatCurrency(committedAnalysis.totalTaxSavings)}
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
      aria-label="Tax Savings"
      data-tax-shield
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-400">
            Tax Savings
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Estimates how much {analysis.taxYear} rental depreciation can lower your income taxes.
            Adjust your income and rate to preview the savings before applying.
          </p>
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

      <div
        className={`mx-4 mt-4 rounded-xl border px-4 py-3 ${statusToneClass(analysis.statusTone)}`}
      >
        <p className="text-sm font-medium text-slate-100">{analysis.statusHeadline}</p>
        <p className="mt-1 text-xs text-slate-400">{analysis.statusDetail}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${Math.min(100, analysis.shieldPercentOfW2)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {analysis.shieldPercentOfW2.toFixed(0)}% of W2 shielded ·{' '}
          {analysis.propertyCount} properties · {analysis.newAcquisitionCount} new in{' '}
          {analysis.taxYear}
        </p>
      </div>

      <div className="mx-4 mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">Total tax shield</p>
          <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
            {formatCurrency(analysis.totalTaxShield)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">Estimated tax savings</p>
          <p className="mt-1 font-mono text-lg font-semibold text-cyan-300">
            {formatCurrency(analysis.totalTaxSavings)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">W2 remaining</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber-400">
            {formatCurrency(analysis.remainingTaxableIncome)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">REPS value</p>
          <p className="mt-1 font-mono text-lg font-semibold text-violet-300">
            {formatCurrency(analysis.repsDeltaSavings)}
          </p>
          <p className="text-[10px] text-slate-500">vs passive-only rules</p>
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          W2 income what-if
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Scrub income without changing your portfolio until you apply. Keys: +/−, R toggles REPS
          preview, Enter apply, Esc reset.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleW2Change(previewW2 - incomeStep)}
            className="rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
            aria-label="Decrease preview W2"
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={W2_MAX}
            step={incomeStep}
            value={previewW2}
            onChange={(e) => handleW2Change(Number(e.target.value))}
            className="min-w-0 flex-1 accent-violet-500"
          />
          <button
            type="button"
            onClick={() => handleW2Change(previewW2 + incomeStep)}
            className="rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
            aria-label="Increase preview W2"
          >
            +
          </button>
          <span className="w-28 shrink-0 text-right font-mono text-sm text-violet-300">
            {formatCurrency(previewW2)}/yr
          </span>
        </div>

        {isDirty && (
          <div
            className={`mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 transition-opacity ${
              isPreviewStale ? 'opacity-60' : 'opacity-100'
            }`}
          >
            <p className="text-xs text-slate-200">
              Preview profile — portfolio still uses committed values until you apply.
            </p>
            {previewDelta && (
              <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                <p>
                  W2: {previewDelta.w2LabelCommitted} →{' '}
                  <span className="text-slate-200">{previewDelta.w2LabelPreview}</span>
                </p>
                {previewDelta.savingsDelta !== 0 && (
                  <p>
                    Tax savings:{' '}
                    <span
                      className={
                        previewDelta.savingsDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {previewDelta.savingsDelta > 0 ? '+' : ''}
                      {formatCurrency(previewDelta.savingsDelta)}
                    </span>
                  </p>
                )}
                {previewDelta.usableDelta !== 0 && (
                  <p>
                    Usable loss:{' '}
                    <span
                      className={
                        previewDelta.usableDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {previewDelta.usableDelta > 0 ? '+' : ''}
                      {formatCurrency(previewDelta.usableDelta)}
                    </span>
                  </p>
                )}
              </div>
            )}
            <div className="mt-2 flex gap-2">
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
                Apply tax profile
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tax profile inputs
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="bonus-carryover" className="mb-1 block text-xs text-slate-400">
              Bonus dep. carryover
            </label>
            <NumericInput
              id="bonus-carryover"
              value={previewProfile.remainingBonusCarryover}
              onChange={(v) =>
                updatePreview({
                  remainingBonusCarryover: Math.min(CARRYOVER_MAX, Math.max(0, v ?? 0)),
                })
              }
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="marginal-rate" className="mb-1 block text-xs text-slate-400">
              Marginal tax rate
            </label>
            <NumericInput
              id="marginal-rate"
              value={previewProfile.marginalTaxRate}
              onChange={(v) => updatePreview({ marginalTaxRate: v ?? 0 })}
              min={0}
              max={0.5}
              allowDecimal
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-2 font-mono text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="state-rate" className="mb-1 block text-xs text-slate-400">
              State tax rate
            </label>
            <NumericInput
              id="state-rate"
              value={previewProfile.stateTaxRate ?? 0}
              onChange={(v) => updatePreview({ stateTaxRate: v ?? 0 })}
              min={0}
              max={0.15}
              allowDecimal
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-2 font-mono text-sm text-slate-100"
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={previewProfile.spouseIsReps}
                onChange={(e) => updatePreview({ spouseIsReps: e.target.checked })}
                className="accent-violet-500"
              />
              Spouse is REPS
            </label>
            <p className="text-[10px] text-slate-500">
              Bonus: {formatPercent(tp.bonusDepreciationRate)} ({tp.taxYear})
            </p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-500">
          Estimates for {tp.taxYear} only. Not tax advice — verify with your CPA.
        </p>
      </div>

      <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-slate-900/30 p-4">
        <TaxBarChart
          w2={tp.annualW2Income}
          offset={taxResult.usableLoss}
          remaining={taxResult.remainingTaxableIncome}
        />
        {!tp.spouseIsReps && (
          <p className="mt-2 text-xs text-amber-400">
            Without REPS: only {formatCurrency(taxResult.withoutRepsUsableLoss)} usable;{' '}
            {formatCurrency(taxResult.withoutRepsCarryforward)} carries forward.
          </p>
        )}
        {taxResult.carryforwardLoss > 0 && tp.spouseIsReps && (
          <p className="mt-2 text-xs text-slate-400">
            {formatCurrency(taxResult.carryforwardLoss)} rental loss carries forward (exceeds W2).
          </p>
        )}
      </div>

      <div className="mx-4 mb-4 mt-4">
        <button
          type="button"
          onClick={() => void setShowPropertyBreakdown(!preferences.showPropertyBreakdown)}
          className="mb-3 text-xs text-slate-400 hover:text-slate-200"
        >
          {preferences.showPropertyBreakdown ? 'Hide' : 'Show'} property breakdown
        </button>

        {preferences.showPropertyBreakdown && (
          <div className="space-y-3">
            <PropertyTaxTable
              title={`Held before ${tp.taxYear}`}
              subtitle="Ongoing annual depreciation — bonus already taken in prior year"
              rows={taxResult.heldProperties}
            />
            <PropertyTaxTable
              title={`Acquiring in ${tp.taxYear}`}
              subtitle={`First-year depreciation including ${formatPercent(tp.bonusDepreciationRate)} bonus on cost seg`}
              rows={taxResult.newAcquisitions}
            />
            {taxResult.excludedFuture.length > 0 && (
              <p className="text-xs text-slate-500">
                Excluded from {tp.taxYear} (future close): {taxResult.excludedFuture.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
