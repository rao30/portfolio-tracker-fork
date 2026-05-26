import { Fragment, useState } from 'react';
import type { ExpenseBreakdown, Portfolio, Property } from '../lib/types';
import { formatCurrency, formatPercent, propertyColor } from '../lib/format';
import { ExpenseBreakdownEditor } from './ExpenseBreakdownEditor';

interface PropertyTableProps {
  portfolio: Portfolio;
  onUpdate: (index: number, field: keyof Property, value: string) => void;
  onExpenseBreakdownChange: (index: number, breakdown: ExpenseBreakdown) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

type EditableField = keyof Property;

const BASIC_COLUMNS: { key: EditableField; label: string; mono?: boolean }[] = [
  { key: 'name', label: 'Property' },
  { key: 'balance', label: 'Balance', mono: true },
  { key: 'marketValue', label: 'Value', mono: true },
  { key: 'annualInterestRate', label: 'Rate', mono: true },
  { key: 'annualAppreciationRate', label: 'Appr.', mono: true },
  { key: 'monthlyPayment', label: 'P&I', mono: true },
  { key: 'monthlyRent', label: 'Rent', mono: true },
  { key: 'monthlyExpenses', label: 'Expenses', mono: true },
];

const ADVANCED_COLUMNS: { key: EditableField; label: string; mono?: boolean }[] = [
  { key: 'vacancyRate', label: 'Vacancy', mono: true },
  { key: 'capexReserveRate', label: 'Capex %', mono: true },
  { key: 'annualRentGrowthRate', label: 'Rent gr.', mono: true },
  { key: 'annualExpenseInflationRate', label: 'Exp infl.', mono: true },
  { key: 'remainingTermMonths', label: 'Term mo.', mono: true },
  { key: 'purchasePrice', label: 'Basis', mono: true },
  { key: 'costSegPercent', label: 'Cost seg', mono: true },
];

const PERCENT_FIELDS = new Set<EditableField>([
  'annualInterestRate',
  'annualAppreciationRate',
  'annualRentGrowthRate',
  'annualExpenseInflationRate',
  'vacancyRate',
  'capexReserveRate',
  'landPercent',
  'costSegPercent',
]);

const CURRENCY_FIELDS = new Set<EditableField>([
  'balance',
  'marketValue',
  'monthlyPayment',
  'monthlyRent',
  'monthlyExpenses',
  'purchasePrice',
  'cashInvested',
]);

function fieldDisplay(p: Property, field: EditableField): string {
  if (field === 'name') return p.name;
  const val = p[field];
  if (val === undefined) return '—';
  if (PERCENT_FIELDS.has(field)) return formatPercent(val as number);
  if (CURRENCY_FIELDS.has(field)) return formatCurrency(val as number);
  if (field === 'remainingTermMonths') return String(val);
  return String(val);
}

function rawValue(p: Property, field: EditableField): string {
  if (field === 'name') return p.name;
  const val = p[field];
  if (val === undefined) return '';
  return String(val);
}

interface EditableCellProps {
  value: string;
  display: string;
  onCommit: (value: string) => void;
  mono?: boolean;
  warn?: boolean;
}

function EditableCell({ value, display, onCommit, mono, warn }: EditableCellProps) {
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
      className={`w-full text-left text-xs hover:text-cyan-300 ${mono ? 'font-mono tabular-nums' : ''} ${warn ? 'text-amber-400' : ''}`}
      title={warn ? display : undefined}
    >
      {display}
    </button>
  );
}

export function PropertyTable({
  portfolio,
  onUpdate,
  onExpenseBreakdownChange,
  onAdd,
  onRemove,
}: PropertyTableProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const { properties } = portfolio;
  const columns = showAdvanced
    ? [...BASIC_COLUMNS, ...ADVANCED_COLUMNS]
    : BASIC_COLUMNS;

  const totals = properties.reduce(
    (acc, p) => ({
      balance: acc.balance + p.balance,
      marketValue: acc.marketValue + p.marketValue,
      monthlyPayment: acc.monthlyPayment + p.monthlyPayment,
      monthlyRent: acc.monthlyRent + p.monthlyRent,
      monthlyExpenses: acc.monthlyExpenses + p.monthlyExpenses,
    }),
    {
      balance: 0,
      marketValue: 0,
      monthlyPayment: 0,
      monthlyRent: 0,
      monthlyExpenses: 0,
    },
  );

  return (
    <div className="glass-card overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Portfolio</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
          >
            {showAdvanced ? 'Hide advanced' : 'Advanced columns'}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
          >
            + Add property
          </button>
        </div>
      </div>
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs text-slate-400">
            <th className="pb-2 pr-2 w-6" />
            {columns.map((col) => (
              <th key={col.key} className="pb-2 pr-2 font-medium">
                {col.label}
              </th>
            ))}
            <th className="pb-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {properties.map((p, i) => {
            const monthlyInterest = p.balance * (p.annualInterestRate / 12);
            const piWarn = p.balance > 0 && p.monthlyPayment < monthlyInterest - 1e-6;

            return (
              <Fragment key={`${p.name}-${i}`}>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: propertyColor(p.name) }}
                  />
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="py-2 pr-2">
                    <EditableCell
                      value={rawValue(p, col.key)}
                      display={fieldDisplay(p, col.key)}
                      onCommit={(v) => onUpdate(i, col.key, v)}
                      mono={col.mono}
                      warn={col.key === 'monthlyPayment' && piWarn}
                    />
                  </td>
                ))}
                <td className="py-2">
                  <div className="flex gap-1">
                    {showAdvanced && (
                      <button
                        type="button"
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                        className="text-xs text-slate-400 hover:text-cyan-300"
                        title="Expense breakdown"
                      >
                        {expandedRow === i ? '▾' : '▸'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      disabled={properties.length <= 1}
                      className="text-xs text-red-400 disabled:opacity-30 hover:text-red-300"
                      aria-label="Remove property"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
              {expandedRow === i && showAdvanced && (
                <tr key={`${p.name}-${i}-breakdown`}>
                  <td colSpan={columns.length + 2} className="pb-3 pl-8 pr-2">
                    <ExpenseBreakdownEditor
                      property={p}
                      onChange={(b) => onExpenseBreakdownChange(i, b)}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="text-xs font-medium text-slate-300">
            <td />
            <td className="pt-2">Totals</td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.balance)}
            </td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.marketValue)}
            </td>
            <td className="pt-2">—</td>
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
            {showAdvanced && ADVANCED_COLUMNS.map((col) => (
              <td key={col.key} className="pt-2">—</td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
