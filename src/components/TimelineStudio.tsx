import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Portfolio, PropertyEvent, PropertyEventType } from '../lib/types';
import type { StrategyId } from '../lib/snowball';
import {
  EVENT_META,
  collectPropertyEvents,
  computeTimelineCommandAnalysis,
  computeTimelineImpact,
  computeTimelinePreviewDelta,
  defaultEventForType,
  formatEventSummary,
  overlaysEqual,
  portfolioFromEventOverlays,
  validatePropertyEvent,
  type PropertyEventOverlay,
} from '../lib/timeline';
import type { TimelineVerdictTone } from '../lib/timelineTypes';
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
import type { UseTimelinePreferencesResult } from '../lib/useTimelinePreferences';

interface TimelineStudioProps {
  portfolio: Portfolio;
  strategyId: StrategyId;
  monthsToPayoff: number;
  cloudEnabled: boolean;
  userId?: string;
  timelineHook: UseTimelinePreferencesResult;
  onApplyEvents: (overlays: PropertyEventOverlay[]) => void;
  onClearEvents: () => void;
  embedded?: boolean;
}

interface EditorState {
  propertyIndex: number;
  eventIndex: number | null;
  draft: PropertyEvent;
}

const EVENT_TYPES = Object.keys(EVENT_META) as PropertyEventType[];

function verdictToneClass(tone: TimelineVerdictTone): string {
  if (tone === 'positive') return 'border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'caution') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-cyan-500/30 bg-cyan-500/10';
}

function normalizeOverlays(
  portfolio: Portfolio,
  overlays: PropertyEventOverlay[],
): PropertyEventOverlay[] {
  const byName = new Map(overlays.map((overlay) => [overlay.propertyName, overlay.events]));
  return portfolio.properties
    .map((property) => ({
      propertyName: property.name,
      events: [...(byName.get(property.name) ?? [])].sort((a, b) => a.month - b.month),
    }))
    .filter((overlay) => overlay.events.length > 0);
}

export function TimelineStudio({
  portfolio,
  strategyId,
  monthsToPayoff,
  cloudEnabled,
  userId,
  timelineHook,
  onApplyEvents,
  onClearEvents,
  embedded = false,
}: TimelineStudioProps) {
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;
  const maxMonth = Math.min(600, Math.max(120, monthsToPayoff + 24));

  const committedOverlays = useMemo(
    () => collectPropertyEvents(portfolio),
    [portfolio],
  );

  const [previewOverlays, setPreviewOverlays] = useState<PropertyEventOverlay[]>(committedOverlays);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const {
    preferences,
    setCollapsed,
    setFocusedPropertyIndex,
    setLastExploredPlanId,
    setShowCommittedGhost,
  } = timelineHook;

  const isDirty = useMemo(
    () => !overlaysEqual(committedOverlays, previewOverlays),
    [committedOverlays, previewOverlays],
  );

  useEffect(() => {
    if (!isDirty) {
      setPreviewOverlays(committedOverlays);
      setPreviewPlanId(null);
    }
  }, [committedOverlays, isDirty]);

  const deferredPreviewOverlays = useDeferredValue(previewOverlays);
  const isPreviewStale = previewOverlays !== deferredPreviewOverlays;

  const previewPortfolio = useMemo(
    () => portfolioFromEventOverlays(portfolio, deferredPreviewOverlays),
    [portfolio, deferredPreviewOverlays],
  );

  const impact = useMemo(
    () => computeTimelineImpact(previewPortfolio, strategyId),
    [previewPortfolio, strategyId],
  );

  const previewDelta = useMemo(
    () =>
      isDirty
        ? computeTimelinePreviewDelta(portfolio, deferredPreviewOverlays, strategyId)
        : null,
    [portfolio, deferredPreviewOverlays, strategyId, isDirty],
  );

  const analysis = useMemo(
    () =>
      computeTimelineCommandAnalysis(portfolio, deferredPreviewOverlays, strategyId),
    [portfolio, deferredPreviewOverlays, strategyId],
  );

  const { scenarios, loading, saveScenario, deleteScenario, canPersistCloud } =
    useTimelineScenarios(cloudEnabled, userId);

  const focusedIndex = Math.min(
    preferences.focusedPropertyIndex,
    Math.max(0, portfolio.properties.length - 1),
  );

  const editorErrors = editor
    ? validatePropertyEvent(editor.draft, portfolio.properties[editor.propertyIndex])
    : [];

  const updatePreviewForProperty = useCallback(
    (propertyIndex: number, events: PropertyEvent[]) => {
      const property = portfolio.properties[propertyIndex];
      setPreviewOverlays((current) => {
        const next = normalizeOverlays(portfolio, [
          ...current.filter((overlay) => overlay.propertyName !== property.name),
          { propertyName: property.name, events: [...events].sort((a, b) => a.month - b.month) },
        ]);
        return next;
      });
      setPreviewPlanId(null);
    },
    [portfolio],
  );

  const openNewEvent = (propertyIndex: number, month: number, type: PropertyEventType = 'rentChange') => {
    const property = portfolio.properties[propertyIndex];
    void setFocusedPropertyIndex(propertyIndex);
    setEditor({
      propertyIndex,
      eventIndex: null,
      draft: defaultEventForType(type, month, property),
    });
  };

  const openEditEvent = (propertyIndex: number, eventIndex: number) => {
    const property = portfolio.properties[propertyIndex];
    const overlay = previewOverlays.find((entry) => entry.propertyName === property.name);
    const event = overlay?.events[eventIndex];
    if (!event) return;
    void setFocusedPropertyIndex(propertyIndex);
    setEditor({
      propertyIndex,
      eventIndex,
      draft: { ...event },
    });
  };

  const commitEditor = () => {
    if (!editor || editorErrors.length > 0) return;
    const property = portfolio.properties[editor.propertyIndex];
    const overlay = previewOverlays.find((entry) => entry.propertyName === property.name);
    const events = [...(overlay?.events ?? [])];
    if (editor.eventIndex == null) {
      events.push(editor.draft);
    } else {
      events[editor.eventIndex] = editor.draft;
    }
    updatePreviewForProperty(editor.propertyIndex, events);
    setEditor(null);
  };

  const deleteEditorEvent = () => {
    if (!editor || editor.eventIndex == null) return;
    const property = portfolio.properties[editor.propertyIndex];
    const overlay = previewOverlays.find((entry) => entry.propertyName === property.name);
    const events = (overlay?.events ?? []).filter((_, index) => index !== editor.eventIndex);
    updatePreviewForProperty(editor.propertyIndex, events);
    setEditor(null);
  };

  const handleApply = useCallback(() => {
    if (!isDirty) return;
    onApplyEvents(deferredPreviewOverlays);
    void setLastExploredPlanId(previewPlanId);
  }, [deferredPreviewOverlays, isDirty, onApplyEvents, previewPlanId, setLastExploredPlanId]);

  const handleDiscard = useCallback(() => {
    setPreviewOverlays(committedOverlays);
    setPreviewPlanId(null);
    setEditor(null);
  }, [committedOverlays]);

  const handleClearPreview = useCallback(() => {
    setPreviewOverlays([]);
    setPreviewPlanId(null);
    setEditor(null);
  }, []);

  const handleSavePlan = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const scenario = await saveScenario({
        name,
        propertyEvents: deferredPreviewOverlays,
      });
      setSaveName('');
      setPreviewPlanId(scenario.id);
      void setLastExploredPlanId(scenario.id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaveBusy(false);
    }
  };

  const loadPlanPreview = useCallback(
    (id: string) => {
      const plan = scenarios.find((scenario) => scenario.id === id);
      if (!plan) return;
      const byName = new Map(
        plan.propertyEvents.map((overlay) => [overlay.propertyName, overlay.events]),
      );
      const next = normalizeOverlays(
        portfolio,
        portfolio.properties.map((property) => ({
          propertyName: property.name,
          events: byName.get(property.name) ?? [],
        })),
      );
      setPreviewOverlays(next);
      setPreviewPlanId(id);
      setEditor(null);
      void setLastExploredPlanId(id);
    },
    [portfolio, scenarios, setLastExploredPlanId],
  );

  const restoredPlanRef = useRef(false);
  useEffect(() => {
    if (restoredPlanRef.current || !preferences.lastExploredPlanId || scenarios.length === 0) {
      return;
    }
    if (committedOverlays.length > 0) return;
    const plan = scenarios.find((scenario) => scenario.id === preferences.lastExploredPlanId);
    if (!plan) return;
    restoredPlanRef.current = true;
    loadPlanPreview(plan.id);
  }, [
    committedOverlays.length,
    loadPlanPreview,
    preferences.lastExploredPlanId,
    scenarios,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !sectionRef.current?.contains(document.activeElement) &&
        !(e.target instanceof HTMLElement && e.target.closest('[data-timeline-studio]'))
      ) {
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
      }

      if (editor) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setEditor(null);
        } else if (e.key === 'Enter' && editorErrors.length === 0) {
          e.preventDefault();
          commitEditor();
        }
        return;
      }

      if (e.key === 'Enter' && isDirty) {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        handleDiscard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, editorErrors.length, handleApply, handleDiscard, isDirty]);

  const monthLabel = (month: number) => {
    const cal = simMonthToCalendar(month, anchorYear, anchorMonth);
    return `${cal.month}/${String(cal.year).slice(-2)}`;
  };

  const shell = embedded
    ? 'space-y-4'
    : 'glass-card overflow-hidden border-cyan-500/20';

  if (preferences.isCollapsed) {
    return (
      <div className={shell} data-timeline-studio>
        <button
          type="button"
          onClick={() => void setCollapsed(false)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
              Timeline Command Center
            </p>
            <p className="truncate text-sm text-slate-200">{analysis.verdict}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Debt-free</p>
            <p className="text-sm font-medium text-slate-200">{analysis.debtFreeLabel}</p>
          </div>
          <span className="shrink-0 text-slate-500" aria-hidden>
            ▼
          </span>
        </button>
      </div>
    );
  }

  return (
    <section ref={sectionRef} className={shell} data-timeline-studio>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-white">Timeline Command Center</h2>
              {isDirty && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Preview
                </span>
              )}
              {isPreviewStale && (
                <span className="text-[10px] text-slate-500">Recalculating…</span>
              )}
            </div>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-400">
              Stage rent bumps, refis, capex, and exits safely — preview impact before applying to
              your portfolio. Enter to apply · Esc to discard.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void setCollapsed(true)}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              Collapse
            </button>
            {impact.eventCount > 0 && (
              <button
                type="button"
                onClick={handleClearPreview}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                Clear preview
              </button>
            )}
            {committedOverlays.length > 0 && (
              <button
                type="button"
                onClick={onClearEvents}
                className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
              >
                Clear committed
              </button>
            )}
          </div>
        </div>

        <div className={`mt-3 rounded-xl border p-3 ${verdictToneClass(analysis.verdictTone)}`}>
          <p className="text-sm text-slate-100">{analysis.verdict}</p>
        </div>

        {isDirty && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <div className="text-xs text-amber-100">
              <span className="font-medium">Unsaved preview</span>
              {previewDelta && (
                <span className="ml-2 text-amber-200/80">
                  {previewDelta.monthsDelta !== 0 && (
                    <>
                      {previewDelta.monthsDelta > 0 ? '+' : ''}
                      {previewDelta.monthsDelta} mo debt-free
                    </>
                  )}
                  {previewDelta.equityDelta !== 0 && (
                    <>
                      {previewDelta.monthsDelta !== 0 ? ' · ' : ''}
                      {previewDelta.equityDelta > 0 ? '+' : ''}
                      {formatCurrency(previewDelta.equityDelta)} equity @ 10 yr
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500"
              >
                Apply to portfolio
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => openNewEvent(focusedIndex, hoverMonth ?? 12, type)}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/5"
                style={{ borderColor: `${EVENT_META[type].color}55` }}
              >
                + {EVENT_META[type].shortLabel}
              </button>
            ))}
          </div>

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
                const previewEvents = (
                  previewOverlays.find((overlay) => overlay.propertyName === property.name)?.events ??
                  []
                ).sort((a, b) => a.month - b.month);
                const committedEvents = (
                  committedOverlays.find((overlay) => overlay.propertyName === property.name)
                    ?.events ?? []
                ).sort((a, b) => a.month - b.month);
                const isFocused = propertyIndex === focusedIndex;

                return (
                  <div
                    key={property.name}
                    className={`group flex items-center gap-2 py-1.5 ${
                      isFocused ? 'rounded-lg bg-cyan-500/5 ring-1 ring-cyan-500/20' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void setFocusedPropertyIndex(propertyIndex)}
                      className="w-28 shrink-0 truncate text-left text-xs font-medium text-slate-300 hover:text-cyan-300"
                      title={property.name}
                    >
                      {property.name}
                    </button>
                    <div
                      className="relative h-8 flex-1 cursor-crosshair rounded-md bg-slate-900/80"
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(
                          0,
                          Math.min(1, (e.clientX - rect.left) / rect.width),
                        );
                        setHoverMonth(Math.max(1, Math.round(pct * maxMonth)));
                      }}
                      onMouseLeave={() => setHoverMonth(null)}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(
                          0,
                          Math.min(1, (e.clientX - rect.left) / rect.width),
                        );
                        const month = Math.max(1, Math.round(pct * maxMonth));
                        openNewEvent(propertyIndex, month);
                      }}
                    >
                      {hoverMonth != null && isFocused && (
                        <div
                          className="pointer-events-none absolute inset-y-0 w-px bg-cyan-500/40"
                          style={{ left: `${(hoverMonth / maxMonth) * 100}%` }}
                        />
                      )}

                      {preferences.showCommittedGhost &&
                        isDirty &&
                        committedEvents.map((event, eventIndex) => {
                          const left = `${(event.month / maxMonth) * 100}%`;
                          return (
                            <div
                              key={`ghost-${event.type}-${event.month}-${eventIndex}`}
                              className="absolute top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[10px] text-slate-500 opacity-60"
                              style={{ left }}
                            >
                              {EVENT_META[event.type].shortLabel}
                            </div>
                          );
                        })}

                      {previewEvents.map((event, eventIndex) => {
                        const meta = EVENT_META[event.type];
                        const left = `${(event.month / maxMonth) * 100}%`;
                        return (
                          <button
                            key={`${event.type}-${event.month}-${eventIndex}`}
                            type="button"
                            title={formatEventSummary(event, anchorYear, anchorMonth)}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditEvent(propertyIndex, eventIndex);
                            }}
                            className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-950 shadow transition hover:scale-105"
                            style={{ left, backgroundColor: meta.color }}
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2 text-[10px] text-slate-500">
              <span>Click a lane to add · Click chip to edit · Quick-add uses focused property</span>
              <label className="flex items-center gap-1.5 text-slate-400">
                <input
                  type="checkbox"
                  checked={preferences.showCommittedGhost}
                  onChange={(e) => void setShowCommittedGhost(e.target.checked)}
                  className="accent-cyan-500"
                />
                Show committed ghost
              </label>
            </div>
          </div>

          {editor && (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-900/80 p-4">
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
                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EVENT_META[type].label}
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
                    onChange={(value) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, month: value ?? 1 },
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
                      onChange={(value) =>
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, rent: value ?? 0 },
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
                        onChange={(value) =>
                          setEditor({
                            ...editor,
                            draft: { ...editor.draft, payment: value },
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
                        onChange={(value) =>
                          setEditor({
                            ...editor,
                            draft: { ...editor.draft, balance: value },
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
                      onChange={(value) =>
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, amount: value ?? 0 },
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
                  {editor.eventIndex == null ? 'Stage event' : 'Update preview'}
                </button>
                {editor.eventIndex != null && (
                  <button
                    type="button"
                    onClick={deleteEditorEvent}
                    className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400"
                  >
                    Remove
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
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Preview impact vs baseline
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
                      {impact.monthsDelta} mo vs no events
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
                <dt className="text-slate-500">Events staged</dt>
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
                {scenarios.map((scenario) => {
                  const isPreviewing = previewPlanId === scenario.id;
                  return (
                    <li key={scenario.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => loadPlanPreview(scenario.id)}
                        className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-white/5 ${
                          isPreviewing ? 'bg-amber-500/15 text-amber-200' : 'text-cyan-300'
                        }`}
                      >
                        {scenario.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteScenario(scenario.id)}
                        className="shrink-0 rounded px-1.5 py-1 text-[10px] text-slate-500 hover:text-red-400"
                        aria-label={`Delete ${scenario.name}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
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
            <p className="mt-2 text-[10px] text-slate-500">
              Loading a plan stages it in preview — apply when ready.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
