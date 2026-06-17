import { useCallback, useMemo } from 'react';
import type { Portfolio, Property } from '../lib/types';
import {
  applyFinancingPatch,
  buildFinancingPreview,
  deriveTermsFromPayoffCap,
  type FinancingType,
  type PropertyFinancingPatch,
  validatePropertyFinancing,
} from '../lib/propertyFinancing';
import { formatCurrency } from '../lib/format';
import { NumericInput } from './NumericInput';

interface FinancingEditorProps {
  property: Property;
  portfolio: Portfolio;
  asOfMonth: number;
  onChange: (patch: PropertyFinancingPatch) => void;
  onDeriveFromCap: (balance: number, monthlyPayment: number) => void;
}

function urgencyClass(urgency: ReturnType<typeof buildFinancingPreview>['urgency']): string {
  if (urgency === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-200';
  if (urgency === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (urgency === 'info') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
  return 'border-white/10 bg-white/[0.02] text-slate-300';
}

export function FinancingEditor({
  property,
  portfolio,
  asOfMonth,
  onChange,
  onDeriveFromCap,
}: FinancingEditorProps) {
  const financingType = property.financingType ?? (property.balloonMonths != null ? 'seller' : 'conventional');
  const preview = useMemo(
    () => buildFinancingPreview(property, portfolio, asOfMonth),
    [property, portfolio, asOfMonth],
  );
  const issues = useMemo(() => validatePropertyFinancing(property), [property]);

  const setType = useCallback(
    (type: FinancingType) => onChange({ financingType: type }),
    [onChange],
  );

  const handleDerive = useCallback(() => {
    const terms = deriveTermsFromPayoffCap(property);
    if (!terms) return;
    onDeriveFromCap(terms.balance, terms.monthlyPayment);
  }, [property, onDeriveFromCap]);

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Financing studio
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Seller notes, balloon timing, and post-refi terms — live preview below.
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 p-0.5">
          {(['conventional', 'seller'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setType(type)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                financingType === type
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {financingType === 'seller' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">Balloon term (months)</span>
            <NumericInput
              value={property.balloonMonths ?? 60}
              onChange={(n) => onChange({ balloonMonths: n ?? 60 })}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">Amortization (months)</span>
            <NumericInput
              value={property.sellerAmortizationMonths ?? 240}
              onChange={(n) => onChange({ sellerAmortizationMonths: n ?? 240 })}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">Seller payoff cap ($)</span>
            <NumericInput
              value={property.sellerPayoffCap ?? 0}
              onChange={(n) => onChange({ sellerPayoffCap: n ?? 0 })}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Yield-maintenance: cap minus P&I paid
            </span>
          </label>
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">Post-balloon refi rate</span>
            <NumericInput
              value={property.balloonRefiAnnualRate ?? portfolio.defaultRefiAnnualRate ?? 0.065}
              onChange={(n) => onChange({ balloonRefiAnnualRate: n ?? 0.065 })}
              allowDecimal
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">Post-balloon refi term (mo)</span>
            <NumericInput
              value={property.balloonRefiTermMonths ?? portfolio.defaultRefiTermMonths ?? 360}
              onChange={(n) => onChange({ balloonRefiTermMonths: n ?? 360 })}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">Seller credit at close ($)</span>
            <NumericInput
              value={property.sellerCredit ?? 0}
              onChange={(n) => onChange({ sellerCredit: n ?? 0 })}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={handleDerive}
              disabled={!property.sellerPayoffCap}
              className="rounded-lg border border-cyan-500/30 bg-cyan-600/20 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-40"
            >
              Derive balance &amp; P&I from payoff cap
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Conventional amortizing loan — no balloon. Switch to seller for note terms and
          yield-maintenance caps.
        </p>
      )}

      <div className={`mt-3 rounded-lg border p-3 ${urgencyClass(preview.urgency)}`}>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {preview.urgencyLabel ? (
            <div>
              <p className="text-[10px] uppercase opacity-70">Balloon clock</p>
              <p className="font-medium">{preview.urgencyLabel}</p>
            </div>
          ) : financingType === 'seller' ? (
            <div>
              <p className="text-[10px] uppercase opacity-70">Balloon</p>
              <p className="font-medium">Past or not scheduled</p>
            </div>
          ) : null}
          {preview.balloonBalanceEstimate != null ? (
            <div>
              <p className="text-[10px] uppercase opacity-70">Est. balloon balance</p>
              <p className="font-mono font-medium tabular-nums">
                {formatCurrency(preview.balloonBalanceEstimate)}
              </p>
            </div>
          ) : null}
          {preview.aggregatePiAtBalloon != null ? (
            <div>
              <p className="text-[10px] uppercase opacity-70">P&I through balloon</p>
              <p className="font-mono font-medium tabular-nums">
                {formatCurrency(preview.aggregatePiAtBalloon)}
              </p>
            </div>
          ) : null}
          {preview.refiPaymentEstimate != null ? (
            <div>
              <p className="text-[10px] uppercase opacity-70">Post-refi P&I est.</p>
              <p className="font-mono font-medium tabular-nums">
                {formatCurrency(preview.refiPaymentEstimate)}/mo
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
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
      ) : null}
    </div>
  );
}

export { applyFinancingPatch };
