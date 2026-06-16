import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { currentSimulationMonth } from './format';
import { buildScheduleOfRealEstate } from './scheduleOfRealEstate';
import { buildScheduleWorkbook } from './scheduleOfRealEstateExcel';
import {
  DEFAULT_PROJECTED_CLOSE_MONTH,
  normalizePortfolio,
  runSimulation,
} from './snowball';

describe('buildScheduleOfRealEstate', () => {
  const portfolio = normalizePortfolio(
    JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
    ),
  );
  const result = runSimulation(portfolio, 'baseline');

  it('builds rows for properties active at month 1', () => {
    const schedule = buildScheduleOfRealEstate(portfolio, result, 1);
    expect(schedule.title).toBe('Schedule of Real Estate');
    expect(schedule.propertyCount).toBeGreaterThan(0);
    expect(schedule.rows.length).toBe(schedule.propertyCount);
    expect(schedule.totals.marketValue).toBeGreaterThan(0);
    expect(schedule.totals.equity).toBeCloseTo(
      schedule.totals.marketValue - schedule.totals.loanBalance,
      0,
    );
  });

  it('defaults projected acquisitions to December of close year', () => {
    const additional = portfolio.properties.find((p) =>
      p.name.startsWith('Additional rental 2026'),
    );
    expect(additional?.closeMonthCalendar).toBe(DEFAULT_PROJECTED_CLOSE_MONTH);
    expect(additional?.closeMonth).toBe(12);
  });

  it('excludes not-yet-closed properties at the current simulation month', () => {
    const asOfMonth = currentSimulationMonth(
      portfolio.simulationAnchorYear ?? 2026,
      portfolio.simulationAnchorMonth ?? 1,
      new Date(2026, 5, 15),
    );
    const schedule = buildScheduleOfRealEstate(portfolio, result, asOfMonth);
    expect(schedule.rows.some((r) => r.propertyDescription.startsWith('116/118'))).toBe(
      true,
    );
    expect(schedule.rows.some((r) => r.propertyDescription.startsWith('144/146'))).toBe(
      true,
    );
    expect(
      schedule.rows.some((r) => r.propertyDescription.startsWith('Additional rental 2026')),
    ).toBe(false);
    expect(
      schedule.rows.some((r) => r.propertyDescription.startsWith('Primary 2026')),
    ).toBe(false);
  });

  it('includes closed Shadybrook properties with June close terms', () => {
    const schedule = buildScheduleOfRealEstate(portfolio, result, 6);
    const shady116 = schedule.rows.find((r) => r.propertyDescription.startsWith('116/118'));
    const shady144 = schedule.rows.find((r) => r.propertyDescription.startsWith('144/146'));
    expect(shady116?.purchasePrice).toBe(360_000);
    expect(shady116?.interestRate).toBe(0.07);
    expect(shady116?.dateAcquired).toBe('Jun 2026');
    expect(shady116?.loanBalance).toBeCloseTo(288_000, -3);
    expect(shady144?.purchasePrice).toBe(344_050);
    expect(shady144?.dateAcquired).toBe('Jun 2026');
    expect(shady144?.loanBalance).toBeGreaterThan(343_000);
    expect(shady144?.loanBalance).toBeLessThanOrEqual(344_050);
    expect(shady144?.cashInvested).toBe(0);
  });

  it('excludes future acquisitions before close month', () => {
    const scheduleY1 = buildScheduleOfRealEstate(portfolio, result, 1);
    const scheduleY3 = buildScheduleOfRealEstate(portfolio, result, 25);
    expect(scheduleY3.propertyCount).toBeGreaterThan(scheduleY1.propertyCount);
  });
});

describe('buildScheduleWorkbook', () => {
  it('creates an Excel workbook with schedule sheet', () => {
    const portfolio = normalizePortfolio(
      JSON.parse(
        readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
      ),
    );
    const result = runSimulation(portfolio, 'baseline');
    const schedule = buildScheduleOfRealEstate(portfolio, result, 1);
    const workbook = buildScheduleWorkbook(schedule);

    expect(workbook.SheetNames).toContain('Schedule of Real Estate');
    const sheet = workbook.Sheets['Schedule of Real Estate'];
    expect(sheet).toBeDefined();

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows[0]?.[0]).toBe('Schedule of Real Estate');
    expect(rows[4]?.[0]).toBe('#');
    expect(rows[4]?.[1]).toBe('Property description');
    const totalRow = rows[rows.length - 1];
    expect(totalRow?.[1]).toBe('TOTAL');
  });
});
