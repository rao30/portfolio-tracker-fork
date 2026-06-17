import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio, PropertyEvent, PropertyEventType } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  EVENT_TYPE_META,
  collectTimelineEvents,
  computeEventsImpact,
  countLifeEvents,
  createDefaultEvent,
  validatePropertyEvent,
  type TimelineEventRow,
} from '../lib/timeline';
import {
  calendarToSimMonth,
  formatCurrency,
  formatMonths,
  formatSimulationMonthShort,
  parseAcquisitionDate,
  propertyColor,
} from '../lib/format';
import { NumericInput } from './NumericInput';

interface LifeEventsTimelineProps {
  portfolio: Portfolio;
  strategyId: StrategyId;
  onAddEvent: (propertyIndex: number, event: PropertyEvent) => void;
  onUpdateEvent: (propertyIndex: number, eventIndex: number, event: PropertyEvent) => void;
  onRemoveEvent: (propertyIndex: number, eventIndex: number) => void;
  embedded?: boolean;
}

function ImpactDelta({ portfolio, strategyId }: { portfolio: Portfolio; strategyId: StrategyId }) {
  const impact = useMemo(
    () => computeEventsImpact(portfolio, strategyId),
    [portfolio, strategyId],
  );

  if (!impact.hasEvents) {
    return (
      <p className="text-sm text-slate-400">
        Add life events to see real-time impact on debt-free date, interest, and equity — no
        spreadsheet recalculation.
      </p>
    );
  }

  const monthsFaster = -impact.monthsDelta;
  const interestSaved = -impact.interestDelta;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
        <p className="text-xs text-slate-400">Debt-free date</p>
        <p className="mt-1 font-mono text-lg tabular-nums text-slate-100">
          {formatMonths(impact.withEvents.monthsToPayoff)}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            monthsFaster > 0
              ? 'text-emerald-400'
              : monthsFaster < 0
                ? 'text-amber-400'
                : 'text-slate-500'
          }`}
        >
          {monthsFaster === 0
            ? 'Same as without events'
            : monthsFaster > 0
              ? `${formatMonths(monthsFaster)} sooner vs no events`
              : `${formatMonths(-monthsFaster)} later vs no events`}
        </p>
      </div>
      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
        <p className="text-xs text-slate-400">Total interest</p>
        <p className="mt-1 font-mono text-lg tabular-nums text-slate-100">
          {formatCurrency(impact.withEvents.totalInterestPaid)}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            interestSaved > 0
              ? 'text-emerald-400'
              : interestSaved < 0
                ? 'text-amber-400'
                : 'text-slate-500'
          }`}
        >
          {interestSaved === 0
            ? 'Unchanged'
            : interestSaved > 0
              ? `${formatCurrency(interestSaved)} saved`
              : `${formatCurrency(-interestSaved)} more`}
        </p>
      </div>
      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
        <p className="text-xs text-slate-400">Year-15 equity</p>
        <p className="mt-1 font-mono text-lg tabular-nums text-cyan-300">
          {formatCurrency(
            impact.withEvents.history.find((h) => h.month === 180)?.totalEquity ??
              impact.withEvents.finalEquity,
          )}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            impact.equityAt15Delta > 0
              ? 'text-emerald-400'
              : impact.equityAt15Delta < 0
                ? 'text-amber-400'
                : 'text-slate-500'
          }`}
        >
          {impact.equityAt15Delta === 0
            ? 'Unchanged vs no events'
            : impact.equityAt15Delta > 0
              ? `+${formatCurrency(impact.equityAt15Delta)} vs no events`
              : `${formatCurrency(impact.equityAt15Delta)} vs no events`}
        </p>
      </div>
    </div>
  );
}

interface EventEditorProps {
  portfolio: Portfolio;
  initial?: { propertyIndex: number; event: PropertyEvent; eventIndex?: number };
  onSave: (propertyIndex: number, event: PropertyEvent, eventIndex?: number) => void;
  onCancel: () => void;
}

function EventEditor({ portfolio, initial, onSave, onCancel }: EventEditorProps) {
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;

  const [propertyIndex, setPropertyIndex] = useState(initial?.propertyIndex ?? 0);
  const [event, setEvent] = useState<PropertyEvent>(
    initial?.event ?? createDefaultEvent('rentChange', 24),
  );
  const [calendarDate, setCalendarDate] = useState(() => {
    const { year, month } = (() => {
      const m = initial?.event.month ?? 24;
      const zeroBased = anchorMonth - 1 + m - 1;
      return { year: anchorYear + Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
    })();
    return `${year}-${String(month).padStart(2, '0')}`;
  });
  const [error, setError] = useState<string | null>(null);

  const syncMonthFromCalendar = useCallback(
    (dateStr: string) => {
      const parsed = parseAcquisitionDate(dateStr);
      if (!parsed) return;
      const simMonth = calendarToSimMonth(
        parsed.year,
        parsed.month,
        anchorYear,
        anchorMonth,
      );
      setEvent((prev) => ({ ...prev, month: simMonth }));
    },
    [anchorYear, anchorMonth],
  );

  useEffect(() => {
    syncMonthFromCalendar(calendarDate);
  }, [calendarDate, syncMonthFromCalendar]);

  const handleTypeChange = (type: PropertyEventType) => {
    setEvent(createDefaultEvent(type, event.month));
  };

  const handleSubmit = () => {
    const validationError = validatePropertyEvent(event);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSave(propertyIndex, event, initial?.eventIndex);
  };

  const meta = EVENT_TYPE_META[event.type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="life-event-editor-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
        <h3 id="life-event-editor-title" className="text-base font-semibold text-slate-100">
          {initial ? 'Edit life event' : 'Add life event'}
        </h3>
        <p className="mt-1 text-xs text-slate-400">{meta.description}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Property</label>
            <select
              value={propertyIndex}
              onChange={(e) => setPropertyIndex(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {portfolio.properties.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Event type</label>
              <select
                value={event.type}
                onChange={(e) => handleTypeChange(e.target.value as PropertyEventType)}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                {(Object.keys(EVENT_TYPE_META) as PropertyEventType[]).map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">When (YYYY-MM)</label>
              <input
                type="month"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Sim month {event.month} · {formatSimulationMonthShort(event.month, anchorYear, anchorMonth)}
              </p>
            </div>
          </div>

          {event.type === 'rentChange' && (
            <div>
              <label className="mb-1 block text-xs text-slate-400">New gross rent ($/mo)</label>
              <NumericInput
                value={event.rent}
                onChange={(v) => setEvent({ ...event, rent: v ?? 0 })}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          )}

          {event.type === 'rateReset' && (
            <div>
              <label className="mb-1 block text-xs text-slate-400">New annual rate (%)</label>
              <NumericInput
                value={event.rate != null ? Math.round(event.rate * 10000) / 100 : undefined}
                onChange={(v) => setEvent({ ...event, rate: (v ?? 0) / 100 })}
                allowDecimal
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          )}

          {event.type === 'refinance' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Rate (%)</label>
                <NumericInput
                  value={event.rate != null ? Math.round(event.rate * 10000) / 100 : undefined}
                  onChange={(v) => setEvent({ ...event, rate: (v ?? 0) / 100 })}
                  allowDecimal
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">P&amp;I ($)</label>
                <NumericInput
                  value={event.payment}
                  onChange={(v) => setEvent({ ...event, payment: v ?? 0 })}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Balance ($)</label>
                <NumericInput
                  value={event.balance}
                  onChange={(v) => setEvent({ ...event, balance: v ?? 0 })}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 font-mono text-sm text-slate-100"
                />
              </div>
            </div>
          )}

          {event.type === 'capexSpike' && (
            <div>
              <label className="mb-1 block text-xs text-slate-400">One-time capex ($)</label>
              <NumericInput
                value={event.amount}
                onChange={(v) => setEvent({ ...event, amount: v ?? 0 })}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          )}

          {event.type === 'acquisition' && event.property && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-400">Property name</label>
                <input
                  type="text"
                  value={event.property.name}
                  onChange={(e) =>
                    setEvent({
                      ...event,
                      property: { ...event.property!, name: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Balance ($)</label>
                <NumericInput
                  value={event.property.balance}
                  onChange={(v) =>
                    setEvent({
                      ...event,
                      property: { ...event.property!, balance: v ?? 0 },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Market value ($)</label>
                <NumericInput
                  value={event.property.marketValue}
                  onChange={(v) =>
                    setEvent({
                      ...event,
                      property: { ...event.property!, marketValue: v ?? 0 },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-2 font-mono text-sm text-slate-100"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            {initial ? 'Save changes' : 'Add event'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineStrip({
  rows,
  maxMonth,
  anchorYear,
  anchorMonth,
}: {
  rows: TimelineEventRow[];
  maxMonth: number;
  anchorYear: number;
  anchorMonth: number;
}) {
  if (maxMonth <= 0) return null;

  return (
    <div className="relative mt-4 h-16 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/80 px-2">
      <div className="relative h-full min-w-[480px]">
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-white/15" />
        {rows.map((row) => {
          const left = `${Math.min(98, Math.max(2, (row.simMonth / maxMonth) * 100))}%`;
          const color = EVENT_TYPE_META[row.type].color;
          return (
            <button
              key={row.id}
              type="button"
              title={row.summary}
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left }}
            >
              <span
                className="block h-3 w-3 rounded-full ring-2 ring-slate-950"
                style={{ backgroundColor: color }}
              />
              <span className="absolute left-1/2 top-4 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 sm:block">
                {formatSimulationMonthShort(row.simMonth, anchorYear, anchorMonth)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LifeEventsTimeline({
  portfolio,
  strategyId,
  onAddEvent,
  onUpdateEvent,
  onRemoveEvent,
  embedded = false,
}: LifeEventsTimelineProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<{
    propertyIndex: number;
    eventIndex: number;
    event: PropertyEvent;
  } | null>(null);

  const rows = useMemo(() => collectTimelineEvents(portfolio), [portfolio]);
  const eventCount = countLifeEvents(portfolio);
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;

  const maxMonth = useMemo(() => {
    const payoff = computeEventsImpact(portfolio, strategyId).withEvents.monthsToPayoff;
    const lastEvent = rows.length > 0 ? rows[rows.length - 1].simMonth : 0;
    return Math.max(payoff, lastEvent, 60);
  }, [portfolio, strategyId, rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !editorOpen) {
        e.preventDefault();
        setEditorOpen(true);
      }
      if (e.key === 'Escape') {
        setEditorOpen(false);
        setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen]);

  const handleSave = (propertyIndex: number, event: PropertyEvent, eventIndex?: number) => {
    if (eventIndex != null) {
      onUpdateEvent(propertyIndex, eventIndex, event);
    } else {
      onAddEvent(propertyIndex, event);
    }
    setEditorOpen(false);
    setEditing(null);
  };

  return (
    <div className={embedded ? 'space-y-4' : 'glass-card space-y-4 p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Life Events Timeline</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Model rent changes, refis, capex, and acquisitions — see payoff impact instantly.
            Press <kbd className="rounded border border-white/20 px-1 font-mono text-[10px]">E</kbd>{' '}
            to add an event.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500"
        >
          + Add event
        </button>
      </div>

      <ImpactDelta portfolio={portfolio} strategyId={strategyId} />

      {rows.length > 0 && (
        <TimelineStrip
          rows={rows}
          maxMonth={maxMonth}
          anchorYear={anchorYear}
          anchorMonth={anchorMonth}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 py-8 text-center">
          <p className="text-sm text-slate-400">No life events yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Competitors make you rebuild spreadsheets for every what-if. Add your first event above.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/[0.02]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: EVENT_TYPE_META[row.type].color }}
              />
              <span
                className="min-w-0 flex-1 truncate font-medium"
                style={{ color: propertyColor(row.propertyName) }}
              >
                {row.propertyName}
              </span>
              <span className="text-xs text-slate-400">{EVENT_TYPE_META[row.type].label}</span>
              <span className="font-mono text-xs tabular-nums text-slate-300">
                {formatSimulationMonthShort(row.simMonth, anchorYear, anchorMonth)}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditing({
                      propertyIndex: row.propertyIndex,
                      eventIndex: row.eventIndex,
                      event: { ...row.event },
                    });
                    setEditorOpen(true);
                  }}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveEvent(row.propertyIndex, row.eventIndex)}
                  className="rounded px-2 py-1 text-xs text-red-400/80 hover:bg-red-500/10 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {eventCount > 0 && (
        <p className="text-[11px] text-slate-500">
          {eventCount} event{eventCount === 1 ? '' : 's'} · Impact updates live as you edit
        </p>
      )}

      {editorOpen && (
        <EventEditor
          portfolio={portfolio}
          initial={
            editing
              ? {
                  propertyIndex: editing.propertyIndex,
                  event: editing.event,
                  eventIndex: editing.eventIndex,
                }
              : undefined
          }
          onSave={handleSave}
          onCancel={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
