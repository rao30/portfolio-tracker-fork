import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { Portfolio, Property, PropertyDraft } from '../lib/types';
import {
  buildIntakeDraft,
  canAdvanceFromStep,
  computeIntakePreview,
  INTAKE_STEP_LABELS,
  INTAKE_STEPS,
  intakeDraftToProperty,
  nextIntakeStep,
  prevIntakeStep,
  validateIntakeStep,
  withAutoPayment,
} from '../lib/propertyIntake';
import type { IntakeStep, IntakeTemplateSource } from '../lib/propertyIntakeTypes';
import type { UsePropertyIntakeResult } from '../lib/usePropertyIntake';
import {
  cashflowToneClass,
  editPercentValue,
  formatCurrency,
  formatLtv,
  formatPercent,
  parsePercentInput,
} from '../lib/format';
import { healthBorderClass, healthSeverityClass } from '../lib/propertyHealth';
import { NumericInput } from './NumericInput';

interface PropertyIntakeCommandCenterProps {
  open: boolean;
  onClose: () => void;
  onAdd: (property: PropertyDraft) => number;
  portfolio: Portfolio;
  template?: Property;
  intakeHook: UsePropertyIntakeResult;
  onFocusNewProperty?: (index: number) => void;
}

const TEMPLATE_OPTIONS: {
  id: IntakeTemplateSource;
  title: string;
  description: string;
}[] = [
  {
    id: 'clone_last',
    title: 'Clone last property',
    description: 'Copy loan ratios and rent assumptions from your most recent door.',
  },
  {
    id: 'acquisition',
    title: 'Acquisition template',
    description: 'Start from your portfolio acquisition defaults for new buys.',
  },
  {
    id: 'blank',
    title: 'Blank slate',
    description: 'Minimal defaults — you fill in every assumption.',
  },
];

function StepIndicator({ current }: { current: IntakeStep }) {
  const currentIdx = INTAKE_STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-1">
      {INTAKE_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = step === current;
        return (
          <li
            key={step}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              active
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                : done
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'bg-white/5 text-slate-500'
            }`}
          >
            {INTAKE_STEP_LABELS[step]}
          </li>
        );
      })}
    </ol>
  );
}

function PreviewPanel({
  portfolio,
  draft,
}: {
  portfolio: Portfolio;
  draft: ReturnType<typeof withAutoPayment>;
}) {
  const preview = useMemo(
    () => computeIntakePreview(draft, portfolio),
    [draft, portfolio],
  );

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Live preview
        </p>
        <p className="mt-1 text-sm font-medium text-white">
          {draft.name.trim() || 'Untitled property'}
        </p>
      </div>

      <div
        className={`rounded-lg border p-3 ${healthBorderClass(preview.health.severity)}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">Health score</span>
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={`inline-block h-2 w-2 rounded-full ${healthSeverityClass(preview.health.severity)}`}
            />
            {preview.health.score}/100
          </span>
        </div>
        {preview.health.issues.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[11px] text-amber-200/90">
            {preview.health.issues.slice(0, 3).map((issue) => (
              <li key={issue.message}>• {issue.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-emerald-300/90">Ready for simulation</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Cashflow/mo</dt>
          <dd
            className={`font-mono tabular-nums ${cashflowToneClass(preview.health.metrics.monthlyCashflow)}`}
          >
            {formatCurrency(preview.health.metrics.monthlyCashflow)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">DSCR</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {Number.isFinite(preview.health.metrics.dscr)
              ? preview.health.metrics.dscr.toFixed(2)
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">LTV</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatLtv(preview.ltv)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Cap rate</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatPercent(preview.capRate)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Equity</dt>
          <dd className="font-mono tabular-nums text-slate-200">
            {formatCurrency(preview.health.metrics.equity)}
          </dd>
        </div>
      </dl>
    </aside>
  );
}

export function PropertyIntakeCommandCenter({
  open,
  onClose,
  onAdd,
  portfolio,
  template,
  intakeHook,
  onFocusNewProperty,
}: PropertyIntakeCommandCenterProps) {
  const { preferences, setPreferredTemplate, setDefaultFinancingType, setLastCompletedStep, setAutoCalculatePayment } =
    intakeHook;

  const [step, setStep] = useState<IntakeStep>('template');
  const [templateSource, setTemplateSource] = useState<IntakeTemplateSource>(
    preferences.preferredTemplate,
  );
  const [draft, setDraft] = useState(() =>
    buildIntakeDraft(
      preferences.preferredTemplate,
      portfolio,
      template,
      preferences.defaultFinancingType,
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const resolvedDraft = useMemo(() => withAutoPayment(draft), [draft]);
  const stepValidation = useMemo(
    () => validateIntakeStep(step, resolvedDraft),
    [step, resolvedDraft],
  );

  useEffect(() => {
    if (!open) return;
    setStep('template');
    setTemplateSource(preferences.preferredTemplate);
    setDraft(
      buildIntakeDraft(
        preferences.preferredTemplate,
        portfolio,
        template,
        preferences.defaultFinancingType,
      ),
    );
  }, [open, portfolio, template, preferences.preferredTemplate, preferences.defaultFinancingType]);

  useEffect(() => {
    if (!open || step !== 'identity') return;
    nameRef.current?.focus();
  }, [open, step]);

  const selectTemplate = useCallback(
    (source: IntakeTemplateSource) => {
      setTemplateSource(source);
      void setPreferredTemplate(source);
      setDraft(
        buildIntakeDraft(source, portfolio, template, preferences.defaultFinancingType),
      );
    },
    [portfolio, template, preferences.defaultFinancingType, setPreferredTemplate],
  );

  const goNext = useCallback(() => {
    if (step === 'template') {
      setStep('identity');
      void setLastCompletedStep('identity');
      return;
    }
    if (!canAdvanceFromStep(step, resolvedDraft)) return;
    const next = nextIntakeStep(step);
    if (next) {
      setStep(next);
      void setLastCompletedStep(next);
    }
  }, [step, resolvedDraft, setLastCompletedStep]);

  const goBack = useCallback(() => {
    const prev = prevIntakeStep(step);
    if (prev) setStep(prev);
  }, [step]);

  const submit = useCallback(() => {
    const review = validateIntakeStep('review', resolvedDraft);
    if (!review.ok) return;
    setSubmitting(true);
    try {
      const property = intakeDraftToProperty(resolvedDraft);
      const newIndex = onAdd(property);
      onFocusNewProperty?.(newIndex);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [resolvedDraft, onAdd, onFocusNewProperty, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && step === 'review') {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && step !== 'review') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'TEXTAREA') return;
        e.preventDefault();
        goNext();
      }
    },
    [step, goNext, submit, onClose],
  );

  if (!open) return null;

  const fieldError = (key: keyof typeof stepValidation.errors) =>
    stepValidation.errors[key];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-intake-title"
      onKeyDown={handleKeyDown}
    >
      <div className="glass-card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl">
        <header className="border-b border-white/10 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="property-intake-title" className="text-lg font-semibold text-white">
                Property Intake Command Center
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Guided add with live health preview · autosaves to your portfolio
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
              aria-label="Close"
            >
              Esc
            </button>
          </div>
          <div className="mt-3">
            <StepIndicator current={step} />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_minmax(14rem,16rem)]">
          <div className="min-w-0 space-y-4">
            {step === 'template' ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {TEMPLATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => selectTemplate(opt.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      templateSource === opt.id
                        ? 'border-cyan-500/50 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                        : 'border-white/10 bg-slate-900/40 hover:border-white/20'
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{opt.title}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-400">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}

            {step === 'identity' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  <span className="mb-1 block">Property name</span>
                  <input
                    ref={nameRef}
                    type="text"
                    placeholder="e.g. 314 Brookwood (Duncanville)"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                  {fieldError('name') ? (
                    <span className="mt-1 block text-[11px] text-red-400">{fieldError('name')}</span>
                  ) : null}
                </label>
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  <span className="mb-1 block">Address (optional)</span>
                  <input
                    type="text"
                    placeholder="Street, City, State Zip"
                    value={draft.address}
                    onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Acquisition date</span>
                  <input
                    type="text"
                    placeholder="2026-6"
                    value={draft.acquisitionDate}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, acquisitionDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                  {fieldError('acquisitionDate') ? (
                    <span className="mt-1 block text-[11px] text-red-400">
                      {fieldError('acquisitionDate')}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[10px] text-slate-500">YYYY-M</span>
                  )}
                </label>
                <fieldset className="block text-xs text-slate-400">
                  <legend className="mb-1">Financing type</legend>
                  <div className="flex gap-2">
                    {(['conventional', 'seller'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          void setDefaultFinancingType(type);
                          setDraft((d) => ({ ...d, financingType: type }));
                        }}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize ${
                          draft.financingType === type
                            ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100'
                            : 'border-white/10 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : null}

            {step === 'loan' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Loan balance ($)</span>
                  <NumericInput
                    value={draft.balance}
                    onChange={(n) => setDraft((d) => ({ ...d, balance: n ?? 0 }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                  {fieldError('balance') ? (
                    <span className="mt-1 block text-[11px] text-red-400">
                      {fieldError('balance')}
                    </span>
                  ) : null}
                </label>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Market value ($)</span>
                  <NumericInput
                    value={draft.marketValue}
                    onChange={(n) =>
                      setDraft((d) => ({
                        ...d,
                        marketValue: n ?? 0,
                        purchasePrice: d.purchasePrice || (n ?? 0),
                      }))
                    }
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                  {fieldError('marketValue') ? (
                    <span className="mt-1 block text-[11px] text-red-400">
                      {fieldError('marketValue')}
                    </span>
                  ) : null}
                </label>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Interest rate (%)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editPercentValue(draft.annualInterestRate)}
                    onChange={(e) => {
                      const rate = parsePercentInput(e.target.value);
                      if (rate != null) {
                        setDraft((d) => ({ ...d, annualInterestRate: rate }));
                      }
                    }}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-500">e.g. 6.5</span>
                </label>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Appreciation (%/yr)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editPercentValue(draft.annualAppreciationRate)}
                    onChange={(e) => {
                      const rate = parsePercentInput(e.target.value);
                      if (rate != null) {
                        setDraft((d) => ({ ...d, annualAppreciationRate: rate }));
                      }
                    }}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                {draft.financingType === 'conventional' ? (
                  <label className="block text-xs text-slate-400">
                    <span className="mb-1 block">Loan term (months)</span>
                    <NumericInput
                      value={draft.loanTermMonths}
                      onChange={(n) => setDraft((d) => ({ ...d, loanTermMonths: n ?? 360 }))}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                ) : (
                  <>
                    <label className="block text-xs text-slate-400">
                      <span className="mb-1 block">Balloon (months)</span>
                      <NumericInput
                        value={draft.balloonMonths}
                        onChange={(n) => setDraft((d) => ({ ...d, balloonMonths: n ?? 60 }))}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                      />
                    </label>
                    <label className="block text-xs text-slate-400">
                      <span className="mb-1 block">Amortization (months)</span>
                      <NumericInput
                        value={draft.sellerAmortizationMonths}
                        onChange={(n) =>
                          setDraft((d) => ({ ...d, sellerAmortizationMonths: n ?? 240 }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                      />
                    </label>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={draft.autoCalculatePayment}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        void setAutoCalculatePayment(checked);
                        setDraft((d) => ({ ...d, autoCalculatePayment: checked }));
                      }}
                      className="rounded border-white/20"
                    />
                    Auto-calculate monthly P&I from balance, rate, and term
                  </label>
                  {!draft.autoCalculatePayment ? (
                    <label className="mt-2 block text-xs text-slate-400">
                      <span className="mb-1 block">Monthly P&I ($)</span>
                      <NumericInput
                        value={draft.monthlyPayment}
                        onChange={(n) =>
                          setDraft((d) => ({ ...d, monthlyPayment: n ?? 0 }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                      />
                      {fieldError('monthlyPayment') ? (
                        <span className="mt-1 block text-[11px] text-red-400">
                          {fieldError('monthlyPayment')}
                        </span>
                      ) : null}
                    </label>
                  ) : (
                    <p className="mt-2 text-sm text-slate-300">
                      P&I:{' '}
                      <span className="font-mono tabular-nums text-cyan-200">
                        {formatCurrency(resolvedDraft.monthlyPayment)}/mo
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {step === 'income' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Monthly rent ($)</span>
                  <NumericInput
                    value={draft.monthlyRent}
                    onChange={(n) => setDraft((d) => ({ ...d, monthlyRent: n ?? 0 }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  <span className="mb-1 block">Operating expenses ($)</span>
                  <NumericInput
                    value={draft.monthlyExpenses}
                    onChange={(n) => setDraft((d) => ({ ...d, monthlyExpenses: n ?? 0 }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    Excludes utilities
                  </span>
                </label>
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  <span className="mb-1 block">Utilities ($/mo, optional)</span>
                  <NumericInput
                    value={draft.monthlyUtilities}
                    onChange={(n) => setDraft((d) => ({ ...d, monthlyUtilities: n ?? 0 }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              </div>
            ) : null}

            {step === 'review' ? (
              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  Adding <strong className="text-white">{resolvedDraft.name}</strong> with{' '}
                  <span className="capitalize text-cyan-200">{resolvedDraft.financingType}</span>{' '}
                  financing.
                </p>
                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Balance</dt>
                    <dd className="font-mono text-white">{formatCurrency(resolvedDraft.balance)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Value</dt>
                    <dd className="font-mono text-white">
                      {formatCurrency(resolvedDraft.marketValue)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Rent</dt>
                    <dd className="font-mono text-white">
                      {formatCurrency(resolvedDraft.monthlyRent)}/mo
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">P&I</dt>
                    <dd className="font-mono text-white">
                      {formatCurrency(resolvedDraft.monthlyPayment)}/mo
                    </dd>
                  </div>
                </dl>
                {!stepValidation.ok ? (
                  <p className="text-xs text-red-400">
                    Fix validation issues before adding to your portfolio.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {step !== 'template' ? (
            <PreviewPanel portfolio={portfolio} draft={resolvedDraft} />
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <p className="text-[10px] text-slate-500">
            Enter next step · ⌘Enter add on review
          </p>
          <div className="flex gap-2">
            {step !== 'template' ? (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
            )}
            {step === 'review' ? (
              <button
                type="button"
                disabled={!stepValidation.ok || submitting}
                onClick={submit}
                className="rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
              >
                {submitting ? 'Adding…' : 'Add to portfolio'}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={step !== 'template' && !canAdvanceFromStep(step, resolvedDraft)}
                className="rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
              >
                Continue
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
