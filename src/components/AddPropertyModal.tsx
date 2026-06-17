import { useEffect, useState } from 'react';
import type { Property, PropertyDraft } from '../lib/types';
import { NumericInput } from './NumericInput';

const EMPTY_DRAFT: PropertyDraft = {
  name: '',
  balance: 0,
  marketValue: 0,
  annualInterestRate: 0.05,
  annualAppreciationRate: 0.03,
  monthlyPayment: 0,
  monthlyRent: 0,
  monthlyExpenses: 0,
};

interface AddPropertyModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (property: PropertyDraft) => void;
  template?: Property;
}

function numField(
  label: string,
  value: number,
  onChange: (n: number) => void,
  opts?: { decimal?: boolean; hint?: string },
) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      <NumericInput
        value={Number.isFinite(value) ? value : 0}
        onChange={(n) => onChange(n ?? 0)}
        allowDecimal={opts?.decimal}
        className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
      />
      {opts?.hint ? <span className="mt-0.5 block text-[10px] text-slate-500">{opts.hint}</span> : null}
    </label>
  );
}

export function AddPropertyModal({ open, onClose, onAdd, template }: AddPropertyModalProps) {
  const [draft, setDraft] = useState<PropertyDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setDraft({
        name: '',
        balance: template.balance,
        marketValue: template.marketValue,
        annualInterestRate: template.annualInterestRate,
        annualAppreciationRate: template.annualAppreciationRate,
        monthlyPayment: template.monthlyPayment,
        monthlyRent: template.monthlyRent,
        monthlyExpenses: template.monthlyExpenses,
      });
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [open, template]);

  if (!open) return null;

  const canSubmit = draft.name.trim().length > 0 && draft.balance > 0;

  const submit = () => {
    if (!canSubmit) return;
    onAdd({ ...draft, name: draft.name.trim() });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-property-title"
    >
      <div className="glass-card w-full max-w-lg p-4 shadow-xl">
        <h3 id="add-property-title" className="text-lg font-semibold text-white">
          Add property
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Click Save changes after editing your portfolio.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400 sm:col-span-2">
            <span className="mb-1 block">Property name</span>
            <input
              type="text"
              autoFocus
              placeholder="e.g. 314 Brookwood (Duncanville)"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          {numField('Loan balance ($)', draft.balance, (n) =>
            setDraft((d) => ({ ...d, balance: n })),
          )}
          {numField('Market value ($)', draft.marketValue, (n) =>
            setDraft((d) => ({ ...d, marketValue: n })),
          )}
          {numField('Annual interest rate', draft.annualInterestRate, (n) =>
            setDraft((d) => ({ ...d, annualInterestRate: n })),
          { decimal: true, hint: 'Decimal, e.g. 0.065 for 6.5%' })}
          {numField('Annual appreciation', draft.annualAppreciationRate, (n) =>
            setDraft((d) => ({ ...d, annualAppreciationRate: n })),
          { decimal: true, hint: 'Default 0.03 = 3%' })}
          {numField('Monthly P&I ($)', draft.monthlyPayment, (n) =>
            setDraft((d) => ({ ...d, monthlyPayment: n })),
          )}
          {numField('Monthly rent ($)', draft.monthlyRent, (n) =>
            setDraft((d) => ({ ...d, monthlyRent: n })),
          )}
          {numField('Monthly expenses ($)', draft.monthlyExpenses, (n) =>
            setDraft((d) => ({ ...d, monthlyExpenses: n })),
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
          >
            Add to portfolio
          </button>
        </div>
      </div>
    </div>
  );
}
