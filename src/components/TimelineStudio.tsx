import { useEffect, useMemo, useState } from 'react';
import type { Portfolio, PropertyEvent, PropertyEventType } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  EVENT_META,
  collectPropertyEvents,
  computeTimelineImpact,
  defaultEventForType,
  formatEventSummary,
  validatePropertyEvent,
} from '../lib/timeline';
import {
  formatCurrency,
  formatMonths,
  propertyColor,
  simMonthToCalendar,
  parsePercentInput,
  editPercentValue,
} from '../lib/format';
import { NumericInput } from './NumericInput';
import { useTimelineScenarios } from '../lib/useTimelineScenarios';

interface TimelineStudioProps {
  portfolio: Portfolio;
  strategyId: StrategyId;
  monthsToPayoff: number;
  cloudEnabled: boolean;
  userId?: string;
  onApplyEvents: (overlays: ReturnType<typeof collectPropertyEvents>) => void;
  onClearEvents: () => void;
  embedded?: boolean;
}

interface EditorState {
  propertyIndex: number;
  eventIndex: number | null;
  draft: PropertyEvent;
}

const EVENT_TYPES = Object.keys(EVENT_META) as PropertyEventType[];

export function TimelineStudio({
  portfolio,
  strategyId,
  monthsToPayoff,
  cloudEnabled,
  userId,
  onApplyEvents,
  onClearEvents,
  embedded = false,
}: TimelineStudioProps) {
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;
  const maxMonth = Math.min(600, Math.max(120, monthsToPayoff + 24));

  const impact = useMemo(
    () => computeTimelineImpact(portfolio, strategyId),
    [portfolio, strategyId],
  );

  const { scenarios, loading, saveScenario, deleteScenario, canPersistCloud } =
    useTimelineScenarios(cloudEnabled, userId);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const editorErrors = editor
    ? validatePropertyEvent(editor.draft, portfolio.properties[editor.propertyIndex])
    : [];

  const openNewEvent = (propertyIndex: number, month: number) => {
    const property = portfolio.properties[propertyIndex];
    setEditor({
      propertyIndex,
      eventIndex: null,
      draft: defaultEventForType('rentChange', month, property),
    });
  };

  const openEditEvent = (propertyIndex: number, eventIndex: number) => {
    const property = portfolio.properties[propertyIndex];
    const event = property.events?.[eventIndex];
    if (!event) return;
    setEditor({
      propertyIndex,
      eventIndex,
      draft: { ...event },
    });
  };

  const commitEditor = () => {
    if (!editor || editorErrors.length > 0) return;
    const property = portfolio.properties[editor.propertyIndex];
    const events = [...(property.events ?? [])];
    if (editor.eventIndex == null) {
      events.push(editor.draft);
    } else {
      events[editor.eventIndex] = editor.draft;
    }
    events.sort((a, b) => a.month - b.month);
    const overlays = portfolio.properties.map((p, i) => ({
      propertyName: p.name,
      events: i === editor.propertyIndex ? events : [...(p.events ?? [])],
    }));
    onApplyEvents(overlays.filter((o) => o.events.length > 0));
    setEditor(null);
  };

  const deleteEditorEvent = () => {
    if (!editor || editor.eventIndex == null) return;
    const property = portfolio.properties[editor.propertyIndex];
    const events = (property.events ?? []).filter((_, i) => i !== editor.eventIndex);
    const overlays = portfolio.properties.map((p, i) => ({
      propertyName: p.name,
      events: i === editor.propertyIndex ? events : [...(p.events ?? [])],
    }));
    onApplyEvents(overlays.filter((o) => o.events.length > 0));
    setEditor(null);
  };

  const handleSavePlan = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      await saveScenario({
        name,
        propertyEvents: collectPropertyEvents(portfolio),
      });
      setSaveName('');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaveBusy(false);
    }
  };

  const loadPlan = (id: string) => {
    const plan = scenarios.find((s) => s.id === id);
    if (!plan) return;
    const byName = new Map(plan.propertyEvents.map((o) => [o.propertyName, o.events]));
    onApplyEvents(
      portfolio.properties.map((p) => ({
        propertyName: p.name,
        events: byName.get(p.name) ?? [],
      })),
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const monthLabel = (month: number) => {
    const cal = simMonthToCalendar(month, anchorYear, anchorMonth);
    return `${cal.month}/${String(cal.year).slice(-2)}`;
  };

  return (
    <div className={embedded ? 'space-y-4' : 'glass-card space-y-4 p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Timeline Studio</h2>
          <p className="mt-0.5 max-w-xl text-xs text-slate-400">
            Plan rent changes, refis, capex, and exits on a visual timeline — see debt-free
            and equity impact instantly. Beats spreadsheet year-by-year entry.
          </p>
        </div>
        {impact.eventCount > 0 && (
          <button
            type="button"
            onClick={onClearEvents}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
          >
            Clear all events
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/50">
          <div className="min-w-[640px] p-3">
            <div className="mb-2 flex text-[10px] text-slate-500">
              <div className="w-28 shrink-0" />
              <div className="relative flex-1">
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                  const month = Math.max(1, Math.round(maxMonth * pct));
                  return (
                    <span
                      key={pct}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${pct * 100}%` }}
                    >
                      {monthLabel(month)}
                    </span>
                  );
                })}
              </div>
            </div>

            {portfolio.properties.map((property, propertyIndex) => {
              const events = [...(property.events ?? [])].sort((a, b) => a.month - b.month);
              return (
                <div key={property.name} className="group flex items-center gap-2 py-1.5">
                  <div
                    className="w-28 shrink-0 truncate text-xs font-medium text-slate-300"
                    title={property.name}
                  >
                    {property.name}
                  </div>
                  <div
                    className="relative h-8 flex-1 cursor-crosshair rounded-md bg-slate-900/80"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      setHoverMonth(Math.max(1, Math.round(pct * maxMonth)));
                    }}
                    onMouseLeave={() => setHoverMonth(null)}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const month = Math.max(1, Math.round(pct * maxMonth));
                      openNewEvent(propertyIndex, month);
                    }}
                  >
                    {hoverMonth != null && (
                      <div
                        className="pointer-events-none absolute inset-y-0 w-px bg-cyan-500/40"
                        style={{ left: `${(hoverMonth / maxMonth) * 100}%` }}
                      />
                    )}
                    {events.map((ev, eventIndex) => {
                      const meta = EVENT_META[ev.type];
                      const left = `${(ev.month / maxMonth) * 100}%`;
                      return (
                        <button
                          key={`${ev.type}-${ev.month}-${eventIndex}`}
                          type="button"
                          title={formatEventSummary(ev, anchorYear, anchorMonth)}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditEvent(propertyIndex, eventIndex);
                          }}
                          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-950 shadow transition hover:scale-105"
                          style={{
                            left,
                            backgroundColor: meta.color,
                          }}
                        >
                          {meta.shortLabel}
                        </button>
                      );
                    })}
                    <div
                      className="absolute inset-y-1 left-0 rounded-sm opacity-20"
                      style={{
                        width: `${Math.min(100, (monthsToPayoff / maxMonth) * 100)}%`,
                        backgroundColor: propertyColor(property.name),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-white/5 px-3 py-2 text-[10px] text-slate-500">
            Click a lane to add an event · Click a chip to edit · Esc to close editor
          </p>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Live impact vs no events
            </h3>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Debt-free</dt>
                <dd className="text-right">
                  <span className="text-white">{formatMonths(impact.eventMonthsToPayoff)}</span>
                  {impact.monthsDelta !== 0 && (
                    <span
                      className={
                        impact.monthsDelta < 0 ? 'ml-1 text-emerald-400' : 'ml-1 text-amber-400'
                      }
                    >
                      {impact.monthsDelta > 0 ? '+' : ''}
                      {impact.monthsDelta} mo
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Equity @ 10 yr</dt>
                <dd className="text-right text-white">
                  {formatCurrency(impact.eventEquityAt10Yr)}
                  {impact.equityDelta !== 0 && (
                    <span
                      className={
                        impact.equityDelta > 0 ? 'ml-1 text-emerald-400' : 'ml-1 text-red-400'
                      }
                    >
                      {impact.equityDelta > 0 ? '+' : ''}
                      {formatCurrency(impact.equityDelta)}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Cashflow @ 10 yr</dt>
                <dd className="text-right text-white">
                  {formatCurrency(impact.eventCashflowAt10Yr)}/mo
                </dd>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <dt className="text-slate-500">Events planned</dt>
                <dd className="text-slate-300">{impact.eventCount}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Saved plans
            </h3>
            {!canPersistCloud && (
              <p className="mt-1 text-[10px] text-slate-500">
                Sign in to sync plans to the cloud. Local storage used otherwise.
              </p>
            )}
            {loading ? (
              <p className="mt-2 text-xs text-slate-500">Loading…</p>
            ) : scenarios.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No saved plans yet.</p>
            ) : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {scenarios.map((s) => (
                  <li key={s.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => loadPlan(s.id)}
                      className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs text-cyan-300 hover:bg-white/5"
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteScenario(s.id)}
                      className="shrink-0 rounded px-1.5 py-1 text-[10px] text-slate-500 hover:text-red-400"
                      aria-label={`Delete ${s.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Plan name"
                maxLength={120}
                className="min-w-0 flex-1 rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
              />
              <button
                type="button"
                disabled={!saveName.trim() || saveBusy || impact.eventCount === 0}
                onClick={() => void handleSavePlan()}
                className="shrink-0 rounded bg-cyan-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
            {saveError && <p className="mt-1 text-[10px] text-red-400">{saveError}</p>}
          </div>
        </div>
      </div>

      {editor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white">
              {editor.eventIndex == null ? 'Add' : 'Edit'} event —{' '}
              {portfolio.properties[editor.propertyIndex]?.name}
            </h3>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Type
                <select
                  value={editor.draft.type}
                  onChange={(e) => {
                    const type = e.target.value as PropertyEventType;
                    setEditor({
                      ...editor,
                      draft: defaultEventForType(
                        type,
                        editor.draft.month,
                        portfolio.properties[editor.propertyIndex],
                      ),
                    });
                  }}
                  className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_META[t].label}
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {EVENT_META[editor.draft.type].description}
                </span>
              </label>

              <label className="block text-xs text-slate-400">
                Month ({monthLabel(editor.draft.month)})
                <NumericInput
                  value={editor.draft.month}
                  onChange={(v) =>
                    setEditor({
                      ...editor,
                      draft: { ...editor.draft, month: v ?? 1 },
                    })
                  }
                  min={1}
                  max={maxMonth}
                  className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                />
              </label>

              {editor.draft.type === 'rentChange' && (
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  New monthly rent
                  <NumericInput
                    value={editor.draft.rent}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, rent: v ?? 0 },
                      })
                    }
                    min={0}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              )}

              {(editor.draft.type === 'rateReset' || editor.draft.type === 'refinance') && (
                <label className="block text-xs text-slate-400">
                  Annual rate (%)
                  <input
                    type="text"
                    value={editPercentValue(editor.draft.rate ?? 0)}
                    onChange={(e) => {
                      const rate = parsePercentInput(e.target.value);
                      if (rate != null) {
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, rate },
                        });
                      }
                    }}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              )}

              {editor.draft.type === 'refinance' && (
                <>
                  <label className="block text-xs text-slate-400">
                    New P&amp;I
                    <NumericInput
                      value={editor.draft.payment}
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, payment: v },
                        })
                      }
                      optional
                      min={0}
                      className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    New balance
                    <NumericInput
                      value={editor.draft.balance}
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, balance: v },
                        })
                      }
                      optional
                      min={0}
                      className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                </>
              )}

              {editor.draft.type === 'capexSpike' && (
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  Capex amount
                  <NumericInput
                    value={editor.draft.amount}
                    onChange={(v) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, amount: v ?? 0 },
                      })
                    }
                    min={0}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              )}
            </div>

            {editorErrors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-red-400">
                {editorErrors.map((err) => (
                  <li key={err.field}>{err.message}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={commitEditor}
                disabled={editorErrors.length > 0}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {editor.eventIndex == null ? 'Add event' : 'Save changes'}
              </button>
              {editor.eventIndex != null && (
                <button
                  type="button"
                  onClick={deleteEditorEvent}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
