import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ExpenseBreakdown, Portfolio, Property, PropertyDraft } from '../lib/types';
import {
  editPercentValue,
  formatCurrency,
  formatPercent,
  parseCurrencyInput,
  parsePercentInput,
  propertyColor,
} from '../lib/format';
import {
  isPropertyActiveAtMonth,
  resolveMonthlyExpenses,
  resolveMonthlyUtilities,
} from '../lib/snowball';
import { AddPropertyModal } from './AddPropertyModal';
import { OperatingCostsCommandCenter } from './OperatingCostsCommandCenter';
import { SellerFinancingCommandCenter } from './SellerFinancingCommandCenter';
import type { UseOperatingCostsResult } from '../lib/useOperatingCosts';
import {
  financingBadgeLabel,
  resolveFinancingType,
  type PropertyFinancingPatch,
} from '../lib/propertyFinancing';
import type { UsePropertyIntakeResult } from '../lib/usePropertyIntake';
import type { UseSellerFinancingResult } from '../lib/useSellerFinancing';

interface PropertyTableProps {
  portfolio: Portfolio;
  onUpdate: (index: number, field: keyof Property, value: string) => void;
  onUpdateAcquisitionDate?: (index: number, value: string) => void;
  onExpenseBreakdownChange?: (index: number, breakdown: ExpenseBreakdown) => void;
  onFinancingChange?: (index: number, patch: PropertyFinancingPatch) => void;
  onDeriveFinancingFromCap?: (index: number, balance: number, monthlyPayment: number) => void;
  sellerFinancingHook: UseSellerFinancingResult;
  onAdd: (property: PropertyDraft) => number;
  onRemove: (index: number) => void;
  intakeHook: UsePropertyIntakeResult;
  operatingCostsHook: UseOperatingCostsResult;
  mobileCards?: boolean;
  /** Simulation month for totals / active rows (matches portfolio year slider). */
  asOfMonth?: number;
  isDirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
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
  { key: 'monthlyExpenses', label: 'Operating', mono: true },
  { key: 'monthlyUtilities', label: 'Utilities', mono: true },
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

const MOBILE_FIELDS: { key: EditableField; label: string }[] = [
  { key: 'balance', label: 'Balance' },
  { key: 'marketValue', label: 'Value' },
  { key: 'annualInterestRate', label: 'Rate' },
  { key: 'monthlyPayment', label: 'P&I' },
  { key: 'monthlyRent', label: 'Rent' },
  { key: 'monthlyExpenses', label: 'Operating' },
  { key: 'monthlyUtilities', label: 'Utilities' },
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
  'monthlyUtilities',
  'purchasePrice',
  'cashInvested',
]);

function financingBadgeClass(p: Property, asOfMonth: number): string {
  const type = resolveFinancingType(p);
  if (type === 'conventional') return 'border-slate-600/50 bg-slate-800/50 text-slate-400';
  const label = financingBadgeLabel(p, asOfMonth);
  if (label.includes('mo')) return 'border-red-500/40 bg-red-500/15 text-red-300';
  if (label.includes('yr') && parseInt(label, 10) <= 2) {
    return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  }
  return 'border-violet-500/40 bg-violet-500/15 text-violet-300';
}

type ExpandPanel = 'financing' | 'expenses';

function closeYearLabel(p: Property, anchorYear: number): string | null {
  if (p.closeYear != null) return String(p.closeYear);
  const closeMonth = p.closeMonth ?? 1;
  if (closeMonth > 1) {
    return String(anchorYear + Math.floor((closeMonth - 1) / 12));
  }
  return null;
}

function fieldDisplay(p: Property, field: EditableField): string {
  if (field === 'name') return p.name;
  if (field === 'monthlyExpenses') {
    return formatCurrency(resolveMonthlyExpenses(p));
  }
  if (field === 'monthlyUtilities') {
    const amt = resolveMonthlyUtilities(p);
    return amt > 0 ? formatCurrency(amt) : '—';
  }
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
  if (PERCENT_FIELDS.has(field)) return editPercentValue(val as number);
  if (CURRENCY_FIELDS.has(field)) return String(Math.round(val as number));
  return String(val);
}

function commitFieldValue(field: EditableField, raw: string): string | null {
  if (field === 'name') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (field === 'acquisitionDate') {
    const trimmed = raw.trim();
    return /^\d{4}-\d{1,2}$/.test(trimmed) ? trimmed : null;
  }
  if (PERCENT_FIELDS.has(field)) {
    const n = parsePercentInput(raw);
    return n == null ? null : String(n);
  }
  if (CURRENCY_FIELDS.has(field)) {
    const n = parseCurrencyInput(raw);
    return n == null ? null : String(n);
  }
  if (field === 'remainingTermMonths') {
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    return Number.isNaN(n) || n < 0 ? null : String(n);
  }
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : String(n);
}

interface EditableCellProps {
  field: EditableField;
  value: string;
  display: string;
  onCommit: (value: string) => void;
  mono?: boolean;
  warn?: boolean;
}

function EditableCell({ field, value, display, onCommit, mono, warn }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    const parsed = commitFieldValue(field, draft);
    if (parsed == null) {
      setDraft(value);
      setEditing(false);
      return;
    }
    onCommit(parsed);
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

function PropertyCard({
  property,
  index,
  onUpdate,
  onRemove,
  canRemove,
  inactive = false,
  closesLabel = null,
}: {
  property: Property;
  index: number;
  onUpdate: (index: number, field: keyof Property, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  inactive?: boolean;
  closesLabel?: string | null;
}) {
  return (
    <article
      className={`section-divider px-3 py-3 ${inactive ? 'opacity-45' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: propertyColor(property.name) }}
            />
            <EditableCell
              field="name"
              value={rawValue(property, 'name')}
              display={property.name}
              onCommit={(v) => onUpdate(index, 'name', v)}
            />
          </div>
          {closesLabel && (
            <p className="pl-4 text-[10px] text-slate-500">Closes {closesLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={!canRemove}
          className="shrink-0 text-xs text-red-400 disabled:opacity-30"
          aria-label="Remove property"
        >
          Remove
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {MOBILE_FIELDS.map((field) => (
          <div key={field.key}>
            <dt className="text-slate-500">{field.label}</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-slate-200">
              <EditableCell
                field={field.key}
                value={rawValue(property, field.key)}
                display={fieldDisplay(property, field.key)}
                onCommit={(v) => onUpdate(index, field.key, v)}
                mono
              />
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function PropertyTable({
  portfolio,
  onUpdate,
  onUpdateAcquisitionDate,
  onExpenseBreakdownChange,
  onFinancingChange,
  onDeriveFinancingFromCap,
  sellerFinancingHook,
  onAdd,
  onRemove,
  intakeHook,
  operatingCostsHook,
  mobileCards = false,
  asOfMonth = 1,
  isDirty = false,
  saving = false,
  onSave,
  onDiscard,
}: PropertyTableProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandPanel, setExpandPanel] = useState<{ index: number; panel: ExpandPanel } | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [financingFilter, setFinancingFilter] = useState<'all' | 'seller' | 'conventional'>(
    'all',
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const { properties } = portfolio;
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const lastProperty = properties[properties.length - 1];
  const columns = showAdvanced
    ? [...BASIC_COLUMNS, ...ADVANCED_COLUMNS]
    : BASIC_COLUMNS;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return properties
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => {
        if (financingFilter === 'seller' && resolveFinancingType(p) !== 'seller') return false;
        if (financingFilter === 'conventional' && resolveFinancingType(p) !== 'conventional') {
          return false;
        }
        if (!q) return true;
        return p.name.toLowerCase().includes(q);
      })
      .map(({ i }) => i);
  }, [properties, searchQuery, financingFilter]);

  const activeProperties = properties.filter((p) =>
    isPropertyActiveAtMonth(p, asOfMonth),
  );

  const totals = activeProperties.reduce(
    (acc, p) => {
      const utilities = resolveMonthlyUtilities(p);
      return {
        balance: acc.balance + p.balance,
        marketValue: acc.marketValue + p.marketValue,
        monthlyPayment: acc.monthlyPayment + p.monthlyPayment,
        monthlyRent: acc.monthlyRent + p.monthlyRent,
        monthlyOperating: acc.monthlyOperating + p.monthlyExpenses,
        monthlyUtilities: acc.monthlyUtilities + utilities,
      };
    },
    {
      balance: 0,
      marketValue: 0,
      monthlyPayment: 0,
      monthlyRent: 0,
      monthlyOperating: 0,
      monthlyUtilities: 0,
    },
  );
  const totalExpenses = totals.monthlyOperating + totals.monthlyUtilities;

  const header = (
    <div className="mb-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Portfolio</h3>
          <p className="text-xs text-slate-500">
            Totals: {activeProperties.length} in service ·{' '}
            {properties.length - activeProperties.length} scheduled later
            {saving ? ' · syncing…' : isDirty && cloudEnabledLabel()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && onSave ? (
            <>
              {onDiscard ? (
                <button
                  type="button"
                  onClick={onDiscard}
                  disabled={saving}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Discard
                </button>
              ) : null}
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save now'}
              </button>
            </>
          ) : null}
          {!mobileCards && (
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced columns'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg border border-cyan-500/30 bg-cyan-600/20 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-600/30"
          >
            + Add property
          </button>
        </div>
      </div>
      {!mobileCards && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search properties… (press /)"
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
            />
          </div>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(['all', 'seller', 'conventional'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setFinancingFilter(filter)}
                className={`rounded-md px-2.5 py-1 text-[11px] capitalize transition ${
                  financingFilter === filter
                    ? 'bg-white/10 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
          {searchQuery || financingFilter !== 'all' ? (
            <span className="text-[11px] text-slate-500">
              {filteredIndices.length} of {properties.length}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );

  function cloudEnabledLabel(): string {
    return ' · auto-save pending';
  }

  if (mobileCards) {
    return (
      <div className="app-surface overflow-hidden">
        <div className="border-b border-white/10 px-3 pt-3">{header}</div>
        {properties.map((p, i) => {
          const active = isPropertyActiveAtMonth(p, asOfMonth);
          return (
            <PropertyCard
              key={`${p.name}-${i}`}
              property={p}
              index={i}
              onUpdate={onUpdate}
              onRemove={onRemove}
              canRemove={properties.length > 1}
              inactive={!active}
              closesLabel={!active ? closeYearLabel(p, anchorYear) : null}
            />
          );
        })}
        <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-slate-400">
          <div>
            <p>Total balance</p>
            <p className="font-mono text-sm tabular-nums text-slate-200">
              {formatCurrency(totals.balance)}
            </p>
          </div>
          <div>
            <p>Total value</p>
            <p className="font-mono text-sm tabular-nums text-slate-200">
              {formatCurrency(totals.marketValue)}
            </p>
          </div>
          <div>
            <p>Total P&I</p>
            <p className="font-mono text-sm tabular-nums text-slate-200">
              {formatCurrency(totals.monthlyPayment)}
            </p>
          </div>
          <div>
            <p>Net rent/mo</p>
            <p className="font-mono text-sm tabular-nums text-slate-200">
              {formatCurrency(totals.monthlyRent - totalExpenses)}
            </p>
          </div>
        </div>
        <AddPropertyModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={onAdd}
          portfolio={portfolio}
          template={lastProperty}
          intakeHook={intakeHook}
        />
      </div>
    );
  }

  return (
    <div className="glass-card overflow-x-auto p-4">
      {header}
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs text-slate-400">
            <th className="pb-2 pr-2 w-6" />
            {columns.map((col) => (
              <th key={col.key} className="pb-2 pr-2 font-medium">
                {col.label}
              </th>
            ))}
            <th className="pb-2 pr-2 font-medium">Acquired</th>
            <th className="pb-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {filteredIndices.map((i) => {
            const p = properties[i];
            const active = isPropertyActiveAtMonth(p, asOfMonth);
            const closes = closeYearLabel(p, anchorYear);
            const monthlyInterest = p.balance * (p.annualInterestRate / 12);
            const piWarn = p.balance > 0 && p.monthlyPayment < monthlyInterest - 1e-6;
            const isExpanded = expandPanel?.index === i;
            const activePanel = isExpanded ? expandPanel.panel : null;

            return (
              <Fragment key={`${p.name}-${i}`}>
                <tr
                  className={`border-b border-white/5 ${active ? '' : 'opacity-45'}`}
                >
                  <td className="py-2 pr-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: propertyColor(p.name) }}
                    />
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className="py-2 pr-2">
                      {col.key === 'name' ? (
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <EditableCell
                              field={col.key}
                              value={rawValue(p, col.key)}
                              display={fieldDisplay(p, col.key)}
                              onCommit={(v) => onUpdate(i, col.key, v)}
                            />
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${financingBadgeClass(p, asOfMonth)}`}
                            >
                              {financingBadgeLabel(p, asOfMonth)}
                            </span>
                          </div>
                          {!active && closes && (
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Closes {closes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <EditableCell
                          field={col.key}
                          value={rawValue(p, col.key)}
                          display={fieldDisplay(p, col.key)}
                          onCommit={(v) => onUpdate(i, col.key, v)}
                          mono={col.mono}
                          warn={col.key === 'monthlyPayment' && piWarn}
                        />
                      )}
                    </td>
                  ))}
                  <td className="py-2 pr-2">
                    {onUpdateAcquisitionDate ? (
                      <EditableCell
                        field="acquisitionDate"
                        value={p.acquisitionDate ?? ''}
                        display={p.acquisitionDate ?? '—'}
                        onCommit={(v) => onUpdateAcquisitionDate(i, v)}
                        mono
                      />
                    ) : (
                      <span className="font-mono text-slate-300">
                        {p.acquisitionDate ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      {onFinancingChange && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandPanel(
                              isExpanded && activePanel === 'financing'
                                ? null
                                : { index: i, panel: 'financing' },
                            )
                          }
                          className={`text-xs hover:text-cyan-300 ${
                            activePanel === 'financing' ? 'text-cyan-300' : 'text-slate-400'
                          }`}
                          title="Seller Financing"
                        >
                          {activePanel === 'financing' ? '▾' : '◈'}
                        </button>
                      )}
                      {onExpenseBreakdownChange && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandPanel(
                              isExpanded && activePanel === 'expenses'
                                ? null
                                : { index: i, panel: 'expenses' },
                            )
                          }
                          className={`text-xs hover:text-cyan-300 ${
                            activePanel === 'expenses' ? 'text-cyan-300' : 'text-slate-400'
                          }`}
                          title="Operating costs"
                        >
                          {activePanel === 'expenses' ? '▾' : '◎'}
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
                {isExpanded && activePanel === 'financing' && onFinancingChange ? (
                  <tr key={`${p.name}-${i}-financing`}>
                    <td colSpan={columns.length + 3} className="pb-3 pl-8 pr-2">
                      <SellerFinancingCommandCenter
                        property={p}
                        portfolio={portfolio}
                        asOfMonth={asOfMonth}
                        sellerFinancingHook={sellerFinancingHook}
                        onApplyFinancing={(patch) => {
                          onFinancingChange(i, patch);
                          if (patch.balance != null && patch.monthlyPayment != null) {
                            onDeriveFinancingFromCap?.(i, patch.balance, patch.monthlyPayment);
                          }
                        }}
                      />
                    </td>
                  </tr>
                ) : null}
                {isExpanded && activePanel === 'expenses' && onExpenseBreakdownChange ? (
                  <tr key={`${p.name}-${i}-breakdown`}>
                    <td colSpan={columns.length + 3} className="pb-3 pl-8 pr-2">
                      <OperatingCostsCommandCenter
                        portfolio={portfolio}
                        property={p}
                        propertyIndex={i}
                        propertyCount={properties.length}
                        costsHook={operatingCostsHook}
                        onApply={(b) => onExpenseBreakdownChange(i, b)}
                        onFocusProperty={(index) => setExpandPanel({ index, panel: 'expenses' })}
                        embedded
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="text-xs font-medium text-slate-300">
            <td />
            <td className="pt-2">Totals (in service)</td>
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
              {formatCurrency(totals.monthlyOperating)}
            </td>
            <td className="pt-2 font-mono tabular-nums">
              {formatCurrency(totals.monthlyUtilities)}
            </td>
            <td className="pt-2">—</td>
            {showAdvanced &&
              ADVANCED_COLUMNS.map((col) => (
                <td key={col.key} className="pt-2">
                  —
                </td>
              ))}
            <td />
          </tr>
        </tfoot>
      </table>

      <AddPropertyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={onAdd}
        portfolio={portfolio}
        template={lastProperty}
        intakeHook={intakeHook}
      />
    </div>
  );
}
