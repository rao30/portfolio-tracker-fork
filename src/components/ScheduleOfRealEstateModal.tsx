import { useEffect, useMemo, useState } from 'react';
import type { Portfolio, ScenarioConfig, SimulationResult } from '../lib/types';
import {
  formatCurrency,
  formatLtv,
  formatPercent,
  currentSimulationMonth,
} from '../lib/format';
import {
  buildScheduleOfRealEstate,
  SCHEDULE_PREVIEW_COLUMNS,
  type ScheduleRow,
} from '../lib/scheduleOfRealEstate';
import { downloadScheduleExcel } from '../lib/scheduleOfRealEstateExcel';
import {
  maxPortfolioDashboardYear,
  monthForPortfolioYear,
  runSimulation,
} from '../lib/snowball';

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
  result,
  scenario,
}: ScheduleOfRealEstateModalProps) {
  const maxYear = useMemo(() => maxPortfolioDashboardYear(result), [result]);
  const defaultYear = useMemo(() => {
    const asOfMonth = currentSimulationMonth(
      portfolio.simulationAnchorYear ?? 2026,
      portfolio.simulationAnchorMonth ?? 1,
    );
    const clamped = Math.max(1, Math.min(asOfMonth, result.history.length));
    return Math.floor((clamped - 1) / 12) + 1;
  }, [portfolio, result]);
  const [year, setYear] = useState(defaultYear);

  useEffect(() => {
    if (open) setYear(defaultYear);
  }, [open, defaultYear]);

  const scheduleResult = useMemo(
    () => runSimulation(portfolio, 'baseline', scenario ?? undefined),
    [portfolio, scenario],
  );

  const schedule = useMemo(() => {
    if (!open) return null;
    const asOfMonth = monthForPortfolioYear(year);
    return buildScheduleOfRealEstate(portfolio, scheduleResult, asOfMonth, scenario);
  }, [open, portfolio, scheduleResult, year, scenario]);

  if (!open || !schedule) return null;

  const yearLabel =
    year === 1
      ? `${schedule.calendarYear} (now)`
      : String(schedule.calendarYear);

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
                As of {schedule.asOfLabel} · {schedule.propertyCount} properties · excludes
                projected acquisitions not yet closed
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

          <div className="mt-4 min-w-[12rem] max-w-xs">
            <label
              htmlFor="schedule-year"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              As-of year ({yearLabel})
            </label>
            <input
              id="schedule-year"
              type="range"
              min={1}
              max={maxYear}
              step={1}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-cyan-500"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-500">
              <span>{portfolio.simulationAnchorYear ?? 2026}</span>
              <span>
                {(portfolio.simulationAnchorYear ?? 2026) + maxYear - 1}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-auto p-4 sm:p-5">
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
        </div>

        <div className="border-t border-white/10 px-4 py-3 text-[10px] text-slate-500 sm:px-5">
          Excel export includes financing type, remaining term, debt service, cash invested, and
          notes. Download for lender or CPA packages.
        </div>
      </div>
    </div>
  );
}
