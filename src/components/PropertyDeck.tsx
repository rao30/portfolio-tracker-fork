import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import type { ExpenseBreakdown, Portfolio, Property, PropertyDraft } from '../lib/types';
import {
  formatCurrency,
  formatLtv,
  propertyColor,
} from '../lib/format';
import { isPropertyActiveAtMonth } from '../lib/snowball';
import {
  financingBadgeLabel,
  resolveFinancingType,
  type PropertyFinancingPatch,
} from '../lib/propertyFinancing';
import {
  buildPropertyHealth,
  healthBorderClass,
  healthSeverityClass,
  type HealthSeverity,
} from '../lib/propertyHealth';
import {
  rawFieldValue,
  validateFieldInput,
} from '../lib/propertyFieldValidation';
import type { PropertyDeckInspectorTab } from '../lib/propertyDeckTypes';
import type { UsePropertyDeckResult } from '../lib/usePropertyDeck';
import type { UsePropertyIntakeResult } from '../lib/usePropertyIntake';
import type { UseOperatingCostsResult } from '../lib/useOperatingCosts';
import { AddPropertyModal } from './AddPropertyModal';
import { OperatingCostsCommandCenter } from './OperatingCostsCommandCenter';
import { FinancingEditor } from './FinancingEditor';
import { PropertyTable } from './PropertyTable';

type EditableField = keyof Property;

const CORE_FIELDS: { key: EditableField; label: string; hint?: string }[] = [
  { key: 'balance', label: 'Loan balance' },
  { key: 'marketValue', label: 'Market value' },
  { key: 'annualInterestRate', label: 'Interest rate', hint: 'Decimal, e.g. 0.065' },
  { key: 'annualAppreciationRate', label: 'Appreciation', hint: 'Decimal, e.g. 0.03' },
  { key: 'monthlyPayment', label: 'Monthly P&I' },
  { key: 'monthlyRent', label: 'Monthly rent' },
  { key: 'monthlyExpenses', label: 'Operating expenses' },
  { key: 'monthlyUtilities', label: 'Utilities' },
];

const ADVANCED_FIELDS: { key: EditableField; label: string; hint?: string }[] = [
  { key: 'vacancyRate', label: 'Vacancy rate' },
  { key: 'capexReserveRate', label: 'Capex reserve %' },
  { key: 'annualRentGrowthRate', label: 'Rent growth' },
  { key: 'annualExpenseInflationRate', label: 'Expense inflation' },
  { key: 'remainingTermMonths', label: 'Remaining term (mo)' },
  { key: 'purchasePrice', label: 'Tax basis' },
  { key: 'costSegPercent', label: 'Cost seg %' },
];

const INSPECTOR_TABS: { id: PropertyDeckInspectorTab; label: string; shortcut: string }[] = [
  { id: 'core', label: 'Core', shortcut: '1' },
  { id: 'financing', label: 'Financing', shortcut: '2' },
  { id: 'expenses', label: 'Expenses', shortcut: '3' },
  { id: 'advanced', label: 'Advanced', shortcut: '4' },
];

interface PropertyDeckProps {
  portfolio: Portfolio;
  deckHook: UsePropertyDeckResult;
  onUpdate: (index: number, field: keyof Property, value: string) => void;
  onUpdateAcquisitionDate?: (index: number, value: string) => void;
  onExpenseBreakdownChange?: (index: number, breakdown: ExpenseBreakdown) => void;
  onFinancingChange?: (index: number, patch: PropertyFinancingPatch) => void;
  onAdd: (property: PropertyDraft) => number;
  onRemove: (index: number) => void;
  intakeHook: UsePropertyIntakeResult;
  operatingCostsHook: UseOperatingCostsResult;
  asOfMonth?: number;
  isDirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  /** Mobile-optimized layout: swipe nav, bottom picker, sticky save bar. */
  variant?: 'default' | 'mobile';
}

function useSwipeNavigation(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  };

  return { onTouchStart, onTouchEnd };
}

function MobilePropertyPicker({
  open,
  onClose,
  properties,
  portfolio,
  filteredIndices,
  focusedIndex,
  asOfMonth,
  searchQuery,
  onSearchChange,
  financingFilter,
  onFinancingFilterChange,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  properties: Property[];
  portfolio: Portfolio;
  filteredIndices: number[];
  focusedIndex: number;
  asOfMonth: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  financingFilter: 'all' | 'seller' | 'conventional';
  onFinancingFilterChange: (f: 'all' | 'seller' | 'conventional') => void;
  onSelect: (index: number) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close property list"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="deck-picker-enter relative max-h-[75vh] rounded-t-2xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h4 className="text-sm font-semibold text-slate-200">Switch property</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
          >
            Done
          </button>
        </div>
        <div className="border-b border-white/10 px-4 py-2.5">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search properties…"
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <div className="mt-2 flex gap-1">
            {(['all', 'seller', 'conventional'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => onFinancingFilterChange(filter)}
                className={`rounded-md px-2.5 py-1 text-[11px] capitalize ${
                  financingFilter === filter
                    ? 'bg-cyan-600/30 text-cyan-200'
                    : 'text-slate-500'
                }`}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filteredIndices.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No matching properties</p>
          ) : (
            <div className="space-y-1">
              {filteredIndices.map((i) => {
                const p = properties[i];
                const health = buildPropertyHealth(p, portfolio);
                return (
                  <PropertyListRow
                    key={`${p.name}-${i}`}
                    property={p}
                    focused={i === focusedIndex}
                    healthSeverity={health.severity}
                    healthScore={health.score}
                    monthlyCashflow={health.metrics.monthlyCashflow}
                    active={isPropertyActiveAtMonth(p, asOfMonth)}
                    onSelect={() => {
                      onSelect(i);
                      onClose();
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function shortName(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0 && slash < 28) return name.slice(0, slash).trim();
  return name.length > 36 ? `${name.slice(0, 34)}…` : name;
}

function dscrTone(dscr: number): string {
  if (!Number.isFinite(dscr)) return 'text-slate-400';
  if (dscr < 1) return 'text-red-400';
  if (dscr < 1.25) return 'text-amber-400';
  return 'text-emerald-400';
}

function cashflowTone(cf: number): string {
  if (cf > 0) return 'text-emerald-400';
  if (cf < 0) return 'text-red-400';
  return 'text-slate-400';
}

function ValidatedField({
  field,
  property,
  onCommit,
}: {
  field: EditableField;
  property: Property;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const value = rawFieldValue(property, field);

  const startEdit = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const commit = () => {
    const result = validateFieldInput(field, draft);
    if (!result.ok) {
      setError(result.error ?? 'Invalid value');
      return;
    }
    onCommit(result.value!);
    setError(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(value);
              setError(null);
              setEditing(false);
            }
          }}
          className={`w-full rounded-lg border bg-slate-900 px-2.5 py-1.5 text-sm text-white ${
            error ? 'border-red-500/60 shake-field' : 'border-cyan-500/50'
          }`}
        />
        {error ? <p className="mt-1 text-[11px] text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="w-full rounded-lg border border-transparent px-2.5 py-1.5 text-left text-sm font-mono tabular-nums text-slate-200 hover:border-white/10 hover:bg-white/[0.03]"
    >
      {field === 'name' ? property.name : rawFieldValue(property, field) || '—'}
    </button>
  );
}

function PropertyInspectorPanel({
  focusedProperty,
  focusedHealth,
  focusedIndex,
  portfolio,
  preferences,
  asOfMonth,
  propertiesCount,
  showShortcuts,
  onUpdate,
  onUpdateAcquisitionDate,
  onExpenseBreakdownChange,
  onFinancingChange,
  onRemove,
  onInspectorTab,
  operatingCostsHook,
  onFocusProperty,
}: {
  focusedProperty: Property;
  focusedHealth: ReturnType<typeof buildPropertyHealth>;
  focusedIndex: number;
  portfolio: Portfolio;
  preferences: { inspectorTab: PropertyDeckInspectorTab };
  asOfMonth: number;
  propertiesCount: number;
  showShortcuts?: boolean;
  onUpdate: (index: number, field: keyof Property, value: string) => void;
  onUpdateAcquisitionDate?: (index: number, value: string) => void;
  onExpenseBreakdownChange?: (index: number, breakdown: ExpenseBreakdown) => void;
  onFinancingChange?: (index: number, patch: PropertyFinancingPatch) => void;
  onRemove: (index: number) => void;
  onInspectorTab: (tab: PropertyDeckInspectorTab) => void;
  operatingCostsHook: UseOperatingCostsResult;
  onFocusProperty: (index: number) => void;
}) {
  return (
    <div className="deck-inspector-enter flex flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: propertyColor(focusedProperty.name) }}
            />
            <div className="min-w-0 flex-1">
              <ValidatedField
                field="name"
                property={focusedProperty}
                onCommit={(v) => onUpdate(focusedIndex, 'name', v)}
              />
            </div>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-medium ${healthBorderClass(focusedHealth.severity)}`}
            >
              Health {focusedHealth.score}
            </span>
          </div>
          {!isPropertyActiveAtMonth(focusedProperty, asOfMonth) && focusedProperty.closeYear != null && (
            <p className="mt-1 text-[11px] text-slate-500">Closes {focusedProperty.closeYear}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(focusedIndex)}
          disabled={propertiesCount <= 1}
          className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30"
        >
          Remove
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">DSCR</p>
          <p className={`font-mono text-sm tabular-nums ${dscrTone(focusedHealth.metrics.dscr)}`}>
            {Number.isFinite(focusedHealth.metrics.dscr)
              ? focusedHealth.metrics.dscr.toFixed(2)
              : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Cashflow/mo</p>
          <p
            className={`font-mono text-sm tabular-nums ${cashflowTone(focusedHealth.metrics.monthlyCashflow)}`}
          >
            {formatCurrency(focusedHealth.metrics.monthlyCashflow)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">LTV</p>
          <p className="font-mono text-sm tabular-nums text-slate-200">
            {formatLtv(focusedHealth.metrics.ltv)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Equity</p>
          <p className="font-mono text-sm tabular-nums text-emerald-300">
            {formatCurrency(focusedHealth.metrics.equity)}
          </p>
        </div>
      </div>

      {focusedHealth.issues.length > 0 ? (
        <div className="mb-4 space-y-1.5">
          {focusedHealth.issues.map((issue) => (
            <div
              key={issue.message}
              className={`rounded-lg border px-3 py-2 text-xs ${
                issue.severity === 'critical'
                  ? 'border-red-500/30 bg-red-500/10 text-red-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-white/10 p-0.5"
        role="tablist"
      >
        {INSPECTOR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={preferences.inspectorTab === tab.id}
            onClick={() => onInspectorTab(tab.id)}
            className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition ${
              preferences.inspectorTab === tab.id
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
            {showShortcuts ? (
              <span className="ml-1 text-[10px] opacity-50">{tab.shortcut}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {preferences.inspectorTab === 'core' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {CORE_FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-[11px] text-slate-500">{field.label}</span>
                <ValidatedField
                  field={field.key}
                  property={focusedProperty}
                  onCommit={(v) => onUpdate(focusedIndex, field.key, v)}
                />
                {field.hint ? (
                  <span className="mt-0.5 block text-[10px] text-slate-600">{field.hint}</span>
                ) : null}
              </label>
            ))}
            {onUpdateAcquisitionDate ? (
              <label className="block">
                <span className="mb-1 block text-[11px] text-slate-500">Acquired</span>
                <ValidatedField
                  field="acquisitionDate"
                  property={focusedProperty}
                  onCommit={(v) => onUpdateAcquisitionDate(focusedIndex, v)}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {preferences.inspectorTab === 'financing' && onFinancingChange ? (
          <FinancingEditor
            property={focusedProperty}
            portfolio={portfolio}
            asOfMonth={asOfMonth}
            onChange={(patch) => onFinancingChange(focusedIndex, patch)}
            onDeriveFromCap={(balance, monthlyPayment) => {
              onFinancingChange(focusedIndex, { balance, monthlyPayment });
            }}
          />
        ) : null}

        {preferences.inspectorTab === 'expenses' && onExpenseBreakdownChange ? (
          <OperatingCostsCommandCenter
            portfolio={portfolio}
            property={focusedProperty}
            propertyIndex={focusedIndex}
            propertyCount={propertiesCount}
            costsHook={operatingCostsHook}
            onApply={(b) => onExpenseBreakdownChange(focusedIndex, b)}
            onFocusProperty={onFocusProperty}
            embedded
          />
        ) : null}

        {preferences.inspectorTab === 'advanced' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {ADVANCED_FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-[11px] text-slate-500">{field.label}</span>
                <ValidatedField
                  field={field.key}
                  property={focusedProperty}
                  onCommit={(v) => onUpdate(focusedIndex, field.key, v)}
                />
                {field.hint ? (
                  <span className="mt-0.5 block text-[10px] text-slate-600">{field.hint}</span>
                ) : null}
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PropertyListRow({
  property,
  focused,
  healthSeverity,
  healthScore,
  monthlyCashflow,
  active,
  onSelect,
}: {
  property: Property;
  focused: boolean;
  healthSeverity: HealthSeverity;
  healthScore: number;
  monthlyCashflow: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-focused={focused ? 'true' : undefined}
      onClick={onSelect}
      className={`deck-row-enter flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
        focused
          ? `${healthBorderClass(healthSeverity)} bg-white/[0.06] shadow-sm`
          : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]'
      } ${active ? '' : 'opacity-50'}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${healthSeverityClass(healthSeverity)}`}
        title={`Health ${healthScore}`}
      />
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: propertyColor(property.name) }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-200">{shortName(property.name)}</p>
        <p className="font-mono text-[10px] tabular-nums text-slate-500">
          {formatCurrency(property.balance)} · {financingBadgeLabel(property, 1)}
        </p>
      </div>
      <span className={`shrink-0 font-mono text-[10px] tabular-nums ${cashflowTone(monthlyCashflow)}`}>
        {formatCurrency(monthlyCashflow)}
      </span>
    </button>
  );
}

export function PropertyDeck({
  portfolio,
  deckHook,
  onUpdate,
  onUpdateAcquisitionDate,
  onExpenseBreakdownChange,
  onFinancingChange,
  onAdd,
  onRemove,
  intakeHook,
  operatingCostsHook,
  asOfMonth = 1,
  isDirty = false,
  saving = false,
  onSave,
  onDiscard,
  variant = 'default',
}: PropertyDeckProps) {
  const {
    preferences,
    setViewMode,
    setFocusedIndex,
    setInspectorTab,
    setFinancingFilter,
    setSearchQuery,
    dismissMobileHint,
  } = deckHook;

  const [modalOpen, setModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(preferences.searchQuery);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { properties } = portfolio;
  const lastProperty = properties[properties.length - 1];

  const handleFocusNewProperty = useCallback(
    (index: number) => {
      void setFocusedIndex(index);
    },
    [setFocusedIndex],
  );

  useEffect(() => {
    setLocalSearch(preferences.searchQuery);
  }, [preferences.searchQuery]);

  const filteredIndices = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    return properties
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => {
        if (preferences.financingFilter === 'seller' && resolveFinancingType(p) !== 'seller') {
          return false;
        }
        if (
          preferences.financingFilter === 'conventional' &&
          resolveFinancingType(p) !== 'conventional'
        ) {
          return false;
        }
        if (!q) return true;
        return p.name.toLowerCase().includes(q);
      })
      .map(({ i }) => i);
  }, [properties, localSearch, preferences.financingFilter]);

  const focusedIndex = Math.min(
    preferences.focusedIndex,
    Math.max(0, properties.length - 1),
  );

  useEffect(() => {
    if (!filteredIndices.includes(focusedIndex) && filteredIndices.length > 0) {
      void setFocusedIndex(filteredIndices[0]);
    }
  }, [filteredIndices, focusedIndex, setFocusedIndex]);

  const focusedProperty = properties[focusedIndex];
  const focusedHealth = useMemo(
    () => (focusedProperty ? buildPropertyHealth(focusedProperty, portfolio) : null),
    [focusedProperty, portfolio],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      if (filteredIndices.length === 0) return;
      const pos = filteredIndices.indexOf(focusedIndex);
      const nextPos =
        pos < 0
          ? 0
          : (pos + delta + filteredIndices.length) % filteredIndices.length;
      void setFocusedIndex(filteredIndices[nextPos]);
    },
    [filteredIndices, focusedIndex, setFocusedIndex],
  );

  const swipeHandlers = useSwipeNavigation(
    () => moveFocus(1),
    () => moveFocus(-1),
  );

  useEffect(() => {
    if (variant === 'mobile') return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (inInput) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key >= '1' && e.key <= '4') {
        const tab = INSPECTOR_TABS[Number(e.key) - 1];
        if (tab) void setInspectorTab(tab.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveFocus, setInspectorTab, variant]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void setSearchQuery(value);
    }, 400);
  };

  if (preferences.viewMode === 'table' && variant !== 'mobile') {
    return (
      <div>
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => void setViewMode('deck')}
            className="rounded-lg border border-cyan-500/30 bg-cyan-600/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-600/25"
          >
            Switch to Deck view
          </button>
        </div>
        <PropertyTable
          portfolio={portfolio}
          onUpdate={onUpdate}
          onUpdateAcquisitionDate={onUpdateAcquisitionDate}
          onExpenseBreakdownChange={onExpenseBreakdownChange}
          onFinancingChange={onFinancingChange}
          onAdd={onAdd}
          onRemove={onRemove}
          intakeHook={intakeHook}
          operatingCostsHook={operatingCostsHook}
          asOfMonth={asOfMonth}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      </div>
    );
  }

  const activeCount = properties.filter((p) => isPropertyActiveAtMonth(p, asOfMonth)).length;
  const positionInFiltered = filteredIndices.indexOf(focusedIndex);
  const filteredPosition = positionInFiltered < 0 ? 0 : positionInFiltered;

  const inspectorProps = focusedProperty && focusedHealth
    ? {
        focusedProperty,
        focusedHealth,
        focusedIndex,
        portfolio,
        preferences,
        asOfMonth,
        propertiesCount: properties.length,
        onUpdate,
        onUpdateAcquisitionDate,
        onExpenseBreakdownChange,
        onFinancingChange,
        onRemove,
        onInspectorTab: (tab: PropertyDeckInspectorTab) => void setInspectorTab(tab),
        operatingCostsHook,
        onFocusProperty: (index: number) => void setFocusedIndex(index),
      }
    : null;

  if (variant === 'mobile') {
    return (
      <>
        <div className="glass-card overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous property"
                disabled={filteredIndices.length <= 1}
                onClick={() => moveFocus(-1)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-lg text-slate-300 disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left"
              >
                {focusedProperty && focusedHealth ? (
                  <>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${healthSeverityClass(focusedHealth.severity)}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                      {shortName(focusedProperty.name)}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                      {filteredIndices.length > 0 ? `${filteredPosition + 1}/${filteredIndices.length}` : '—'}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-slate-500">Select property</span>
                )}
              </button>
              <button
                type="button"
                aria-label="Next property"
                disabled={filteredIndices.length <= 1}
                onClick={() => moveFocus(1)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-lg text-slate-300 disabled:opacity-30"
              >
                ›
              </button>
              <button
                type="button"
                aria-label="Add property"
                onClick={() => setModalOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-600/20 text-lg text-cyan-200"
              >
                +
              </button>
            </div>

            {!preferences.mobileHintDismissed ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
                <p className="text-[11px] text-cyan-100/90">
                  Swipe left or right on the card to jump between properties.
                </p>
                <button
                  type="button"
                  onClick={() => void dismissMobileHint()}
                  className="shrink-0 rounded-md bg-cyan-600/40 px-2 py-1 text-[10px] font-medium text-cyan-100"
                >
                  Got it
                </button>
              </div>
            ) : null}

            <p className="mt-1.5 text-center text-[10px] text-slate-600">
              {activeCount} in service · tap name to browse all
              {isDirty ? ' · unsaved' : ''}
            </p>
          </div>

          <div
            className="p-4 pb-28"
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchEnd={swipeHandlers.onTouchEnd}
          >
            {inspectorProps ? (
              <PropertyInspectorPanel {...inspectorProps} showShortcuts={false} />
            ) : (
              <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                Add a property to get started
              </div>
            )}
          </div>
        </div>

        {isDirty && onSave ? (
          <div className="fixed inset-x-0 bottom-16 z-40 border-t border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
            <div className="flex gap-2">
              {onDiscard ? (
                <button
                  type="button"
                  onClick={onDiscard}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-slate-300 disabled:opacity-50"
                >
                  Discard
                </button>
              ) : null}
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex-[2] rounded-lg bg-cyan-600 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : null}

        <MobilePropertyPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          properties={properties}
          portfolio={portfolio}
          filteredIndices={filteredIndices}
          focusedIndex={focusedIndex}
          asOfMonth={asOfMonth}
          searchQuery={localSearch}
          onSearchChange={handleSearchChange}
          financingFilter={preferences.financingFilter}
          onFinancingFilterChange={(f) => void setFinancingFilter(f)}
          onSelect={(i) => void setFocusedIndex(i)}
        />

        <AddPropertyModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={onAdd}
          portfolio={portfolio}
          template={lastProperty}
          intakeHook={intakeHook}
          onFocusNewProperty={handleFocusNewProperty}
        />
      </>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Property Deck</h3>
            <p className="text-xs text-slate-500">
              {activeCount} in service · {properties.length} total
              {isDirty ? ' · unsaved changes' : ''}
              {saving ? ' · saving…' : ''}
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
            <button
              type="button"
              onClick={() => void setViewMode('table')}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
            >
              Table view
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg border border-cyan-500/30 bg-cyan-600/20 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-600/30"
            >
              + Add property
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <input
              ref={searchRef}
              type="search"
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search… (press /)"
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
            />
          </div>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(['all', 'seller', 'conventional'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => void setFinancingFilter(filter)}
                className={`rounded-md px-2.5 py-1 text-[11px] capitalize transition ${
                  preferences.financingFilter === filter
                    ? 'bg-white/10 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
          <span className="hidden text-[10px] text-slate-600 sm:inline">
            j/k navigate · 1–4 tabs
          </span>
        </div>
      </div>

      <div className="grid min-h-[28rem] lg:grid-cols-[minmax(14rem,18rem)_1fr]">
        <div
          ref={listRef}
          className="max-h-[32rem] overflow-y-auto border-b border-white/10 p-2 lg:max-h-none lg:border-b-0 lg:border-r"
        >
          {filteredIndices.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500">No matching properties</p>
          ) : (
            <div className="space-y-1">
              {filteredIndices.map((i) => {
                const p = properties[i];
                const health = buildPropertyHealth(p, portfolio);
                return (
                  <PropertyListRow
                    key={`${p.name}-${i}`}
                    property={p}
                    focused={i === focusedIndex}
                    healthSeverity={health.severity}
                    healthScore={health.score}
                    monthlyCashflow={health.metrics.monthlyCashflow}
                    active={isPropertyActiveAtMonth(p, asOfMonth)}
                    onSelect={() => void setFocusedIndex(i)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {focusedProperty && focusedHealth && inspectorProps ? (
          <div className="deck-inspector-enter flex flex-col p-4">
            <PropertyInspectorPanel {...inspectorProps} showShortcuts />
          </div>
        ) : (
          <div className="flex items-center justify-center p-8 text-sm text-slate-500">
            Select a property to inspect
          </div>
        )}
      </div>

      <AddPropertyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={onAdd}
        portfolio={portfolio}
        template={lastProperty}
        intakeHook={intakeHook}
        onFocusNewProperty={handleFocusNewProperty}
      />
    </div>
  );
}
