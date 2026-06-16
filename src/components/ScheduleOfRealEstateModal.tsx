import { useEffect, useMemo, useState } from 'react';
import type { Portfolio, ScenarioConfig, SimulationResult } from '../lib/types';
import {
  formatCurrency,
  formatLtv,
  formatPercent,
  formatSimulationMonthLabel,
  formatSimulationMonthShort,
  currentSimulationMonth,
} from '../lib/format';
import {
  buildScheduleOfRealEstate,
  SCHEDULE_PREVIEW_COLUMNS,
  type ScheduleRow,
} from '../lib/scheduleOfRealEstate';
import { downloadScheduleExcel } from '../lib/scheduleOfRealEstateExcel';
import { runSimulation } from '../lib/snowball';

interface ScheduleOfRealEstateModalProps {
  open: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  result: SimulationResult;
  scenario?: ScenarioConfig | null;
}

function formatCellValue(
  row: ScheduleRow,
  format: 'text' | 'currency' | 'percent' | 'rate',
  key: keyof ScheduleRow,
): string {
  const value = row[key];
  if (format === 'currency' && typeof value === 'number') return formatCurrency(value);
  if (format === 'percent' && typeof value === 'number') return formatLtv(value);
  if (format === 'rate' && typeof value === 'number') return formatPercent(value);
  return String(value);
}

export function ScheduleOfRealEstateModal({
  open,
  onClose,
  portfolio,
  result: _result,
  scenario,
}: ScheduleOfRealEstateModalProps) {
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;

  const scheduleResult = useMemo(
    () => runSimulation(portfolio, 'baseline', scenario ?? undefined),
    [portfolio, scenario],
  );

  const maxMonth = scheduleResult.history.length;

  const defaultMonth = useMemo(() => {
    const asOfMonth = currentSimulationMonth(anchorYear, anchorMonth);
    return Math.max(1, Math.min(asOfMonth, maxMonth));
  }, [anchorYear, anchorMonth, maxMonth]);

  const [asOfMonth, setAsOfMonth] = useState(defaultMonth);

  useEffect(() => {
    if (open) setAsOfMonth(defaultMonth);
  }, [open, defaultMonth]);

  const schedule = useMemo(() => {
    if (!open) return null;
    return buildScheduleOfRealEstate(portfolio, scheduleResult, asOfMonth, scenario);
  }, [open, portfolio, scheduleResult, asOfMonth, scenario]);

  const timelineStart = formatSimulationMonthShort(1, anchorYear, anchorMonth);
  const timelineEnd = formatSimulationMonthShort(maxMonth, anchorYear, anchorMonth);
  const monthLabel = formatSimulationMonthLabel(asOfMonth, anchorYear, anchorMonth);

  const stepMonth = (delta: number) => {
    setAsOfMonth((current) => Math.max(1, Math.min(maxMonth, current + delta)));
  };

  if (!open || !schedule) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-real-estate-title"
      onClick={onClose}
    >
      <div
        className="glass-card flex max-h-[92vh] w-full max-w-6xl flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="schedule-real-estate-title" className="text-lg font-semibold text-white">
                Schedule of Real Estate
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Personal financial statement format · NOI after vacancy · operating expenses
                exclude debt service
              </p>
              <p className="mt-1 text-xs text-slate-500">
                As of {schedule.asOfLabel} · {schedule.propertyCount} properties owned · excludes
                acquisitions not yet closed
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadScheduleExcel(schedule)}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-cyan-500"
              >
                Download Excel
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="schedule-month"
                className="text-xs font-medium text-slate-400"
              >
                As-of month
              </label>
              <span className="font-mono text-xs tabular-nums text-slate-300">
                {monthLabel}
                <span className="text-slate-500"> · sim month {asOfMonth}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                disabled={asOfMonth <= 1}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-30"
                aria-label="Previous month"
              >
                −
              </button>
              <input
                id="schedule-month"
                type="range"
                min={1}
                max={maxMonth}
                step={1}
                value={asOfMonth}
                onChange={(e) => setAsOfMonth(Number(e.target.value))}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-cyan-500"
              />
              <button
                type="button"
                onClick={() => stepMonth(1)}
                disabled={asOfMonth >= maxMonth}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-30"
                aria-label="Next month"
              >
                +
              </button>
            </div>

            <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-500">
              <span>{timelineStart}</span>
              <span>{timelineEnd}</span>
            </div>
          </div>
        </div>

        <div className="overflow-auto p-4 sm:p-5">
          {schedule.propertyCount === 0 ? (
            <p className="text-sm text-slate-400">
              No properties owned as of {monthLabel}. Step forward to the month after a close
              date to include that property.
            </p>
          ) : (
            <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-slate-500">
                  {SCHEDULE_PREVIEW_COLUMNS.map((col) => (
                    <th key={col.key} className="px-2 py-2 font-medium">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row) => (
                  <tr
                    key={row.propertyDescription}
                    className="border-b border-white/5 text-slate-300 hover:bg-white/[0.03]"
                  >
                    {SCHEDULE_PREVIEW_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-2 py-2 ${
                          col.format === 'text' ? 'max-w-[14rem] truncate' : 'font-mono tabular-nums'
                        }`}
                      >
                        {formatCellValue(row, col.format, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 font-semibold text-slate-200">
                  {SCHEDULE_PREVIEW_COLUMNS.map((col) => {
                    if (col.key === 'propertyDescription') {
                      return (
                        <td key={col.key} className="px-2 py-2">
                          TOTAL
                        </td>
                      );
                    }
                    const totalsKey = col.key as keyof typeof schedule.totals;
                    if (!(totalsKey in schedule.totals)) {
                      return <td key={col.key} className="px-2 py-2">—</td>;
                    }
                    const value = schedule.totals[totalsKey];
                    if (col.format === 'currency') {
                      return (
                        <td key={col.key} className="px-2 py-2 font-mono tabular-nums">
                          {formatCurrency(value)}
                        </td>
                      );
                    }
                    if (col.format === 'percent') {
                      return (
                        <td key={col.key} className="px-2 py-2 font-mono tabular-nums">
                          {formatLtv(value)}
                        </td>
                      );
                    }
                    return <td key={col.key} className="px-2 py-2">—</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3 text-[10px] text-slate-500 sm:px-5">
          Step one month at a time to see when each acquisition enters the schedule. Excel export
          reflects the selected month.
        </div>
      </div>
    </div>
  );
}
