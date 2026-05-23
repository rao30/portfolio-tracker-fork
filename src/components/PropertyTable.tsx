import { useState } from 'react';
import type { Property } from '../lib/types';
import { formatCurrency, formatPercent, propertyColor } from '../lib/format';

interface PropertyTableProps {
  properties: Property[];
  onUpdate: (index: number, field: keyof Property, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

type EditableField = keyof Property;

function fieldDisplay(p: Property, field: EditableField): string {
  if (field === 'name') return p.name;
  if (field === 'annualInterestRate') return formatPercent(p.annualInterestRate);
  if (field === 'balance' || field === 'monthlyPayment' || field === 'monthlyRent' || field === 'monthlyExpenses') {
    return formatCurrency(p[field]);
  }
  return String(p[field]);
}

function rawValue(p: Property, field: EditableField): string {
  if (field === 'name') return p.name;
  if (field === 'annualInterestRate') return String(p.annualInterestRate);
  return String(p[field]);
}

interface EditableCellProps {
  value: string;
  display: string;
  onCommit: (value: string) => void;
  mono?: boolean;
}

function EditableCell({ value, display, onCommit, mono }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onCommit(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full min-w-[4rem] rounded border border-cyan-500/50 bg-slate-900 px-1 py-0.5 text-xs text-white"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`w-full text-left text-xs hover:text-cyan-300 ${mono ? 'font-mono tabular-nums' : ''}`}
    >
      {display}
    </button>
  );
}

const COLUMNS: { key: EditableField; label: string; mono?: boolean }[] = [
  { key: 'name', label: 'Property' },
  { key: 'balance', label: 'Balance', mono: true },
  { key: 'annualInterestRate', label: 'Rate', mono: true },
  { key: 'monthlyPayment', label: 'P&I', mono: true },
  { key: 'monthlyRent', label: 'Rent', mono: true },
  { key: 'monthlyExpenses', label: 'Expenses', mono: true },
];

export function PropertyTable({
  properties,
  onUpdate,
  onAdd,
  onRemove,
}: PropertyTableProps) {
  const totals = properties.reduce(
    (acc, p) => ({
      balance: acc.balance + p.balance,
      monthlyPayment: acc.monthlyPayment + p.monthlyPayment,
      monthlyRent: acc.monthlyRent + p.monthlyRent,
      monthlyExpenses: acc.monthlyExpenses + p.monthlyExpenses,
    }),
    { balance: 0, monthlyPayment: 0, monthlyRent: 0, monthlyExpenses: 0 },
  );

  return (
    <div className="glass-card overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Portfolio</h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
        >
          + Add property
        </button>
      </div>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs text-slate-400">
            <th className="pb-2 pr-2 w-6" />
            {COLUMNS.map((col) => (
              <th key={col.key} className="pb-2 pr-2 font-medium">
                {col.label}
              </th>
            ))}
            <th className="pb-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {properties.map((p, i) => (
            <tr key={`${p.name}-${i}`} className="border-b border-white/5">
              <td className="py-2 pr-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: propertyColor(p.name) }}
                />
              </td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="py-2 pr-2">
                  <EditableCell
                    value={rawValue(p, col.key)}
                    display={fieldDisplay(p, col.key)}
                    onCommit={(v) => onUpdate(i, col.key, v)}
                    mono={col.mono}
                  />
                </td>
              ))}
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  disabled={properties.length <= 1}
                  className="text-xs text-red-400 disabled:opacity-30 hover:text-red-300"
                  aria-label="Remove property"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-xs font-medium text-slate-300">
            <td />
            <td className="pt-2">Totals</td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.balance)}
            </td>
            <td className="pt-2">—</td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.monthlyPayment)}
            </td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.monthlyRent)}
            </td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.monthlyExpenses)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
