import type { ExpenseBreakdown, Property } from '../lib/types';
import { resolveMonthlyExpenses } from '../lib/snowball';
import { formatCurrency } from '../lib/format';

interface ExpenseBreakdownEditorProps {
  property: Property;
  onChange: (breakdown: ExpenseBreakdown) => void;
}

function BreakdownInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-500">{label}</label>
      <input
        type="number"
        min={0}
        step={10}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-white/10 bg-slate-900/80 px-1 py-0.5 font-mono text-xs text-slate-100"
      />
    </div>
  );
}

export function ExpenseBreakdownEditor({
  property,
  onChange,
}: ExpenseBreakdownEditorProps) {
  const b: ExpenseBreakdown = property.expenseBreakdown ?? {};

  const setField = (key: keyof ExpenseBreakdown, val: string) => {
    const num = val === '' ? undefined : Number(val);
    onChange({ ...b, [key]: num });
  };

  return (
    <div className="rounded border border-white/5 bg-slate-900/40 p-2">
      <p className="mb-2 text-[10px] font-medium text-slate-400">
        Expense breakdown — computed total:{' '}
        {formatCurrency(resolveMonthlyExpenses(property))}
      </p>
      <div className="grid grid-cols-4 gap-2">
        <BreakdownInput
          label="Property tax"
          value={b.propertyTax}
          onChange={(v) => setField('propertyTax', v)}
        />
        <BreakdownInput
          label="Insurance"
          value={b.insurance}
          onChange={(v) => setField('insurance', v)}
        />
        <BreakdownInput
          label="HOA"
          value={b.hoa}
          onChange={(v) => setField('hoa', v)}
        />
        <BreakdownInput
          label="Management"
          value={b.management}
          onChange={(v) => setField('management', v)}
        />
        <BreakdownInput
          label="Mgmt % of rent"
          value={b.managementPercent}
          onChange={(v) => setField('managementPercent', v)}
        />
        <BreakdownInput
          label="Maintenance"
          value={b.maintenance}
          onChange={(v) => setField('maintenance', v)}
        />
        <BreakdownInput
          label="Utilities"
          value={b.utilities}
          onChange={(v) => setField('utilities', v)}
        />
        <BreakdownInput
          label="Other"
          value={b.other}
          onChange={(v) => setField('other', v)}
        />
      </div>
    </div>
  );
}
