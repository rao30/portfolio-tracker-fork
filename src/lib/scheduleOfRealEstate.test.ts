import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildScheduleOfRealEstate } from './scheduleOfRealEstate';
import { buildScheduleWorkbook } from './scheduleOfRealEstateExcel';
import { normalizePortfolio, runSimulation } from './snowball';

describe('buildScheduleOfRealEstate', () => {
  const portfolio = normalizePortfolio(
    JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
    ),
  );
  const result = runSimulation(portfolio, 'highestRate');

  it('builds rows for properties active at month 1', () => {
    const schedule = buildScheduleOfRealEstate(portfolio, result, 1);
    expect(schedule.title).toBe('Schedule of Real Estate');
    expect(schedule.propertyCount).toBeGreaterThan(0);
    expect(schedule.rows.length).toBe(schedule.propertyCount);
    expect(schedule.totals.marketValue).toBeGreaterThan(0);
    expect(schedule.totals.equity).toBe(
      schedule.totals.marketValue - schedule.totals.loanBalance,
    );
  });

  it('includes closed Shadybrook properties in year 1', () => {
    const schedule = buildScheduleOfRealEstate(portfolio, result, 1);
    const shady116 = schedule.rows.find((r) => r.propertyDescription.startsWith('116/118'));
    const shady144 = schedule.rows.find((r) => r.propertyDescription.startsWith('144/146'));
    expect(shady116?.purchasePrice).toBe(360_000);
    expect(shady116?.loanBalance).toBeGreaterThan(280_000);
    expect(shady116?.loanBalance).toBeLessThanOrEqual(288_000);
    expect(shady116?.interestRate).toBe(0.07);
    expect(shady144?.purchasePrice).toBe(344_050);
    expect(shady144?.loanBalance).toBeGreaterThan(340_000);
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
    const result = runSimulation(portfolio, 'highestRate');
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
