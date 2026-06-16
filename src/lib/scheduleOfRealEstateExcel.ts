import * as XLSX from 'xlsx';
import type { ScheduleOfRealEstate, ScheduleRow } from './scheduleOfRealEstate';
import { SCHEDULE_EXCEL_COLUMNS } from './scheduleOfRealEstate';

const CURRENCY_FMT = '$#,##0';
const PERCENT_FMT = '0.0%';
const RATE_FMT = '0.00%';

function cellValue(
  row: ScheduleRow,
  key: keyof ScheduleRow | 'lineNumber',
  lineNumber?: number,
): string | number {
  if (key === 'lineNumber') return lineNumber ?? '';
  const value = row[key];
  if (typeof value === 'number') return value;
  return value;
}

function cellFormat(format: 'text' | 'currency' | 'percent' | 'rate'): string | undefined {
  switch (format) {
    case 'currency':
      return CURRENCY_FMT;
    case 'percent':
      return PERCENT_FMT;
    case 'rate':
      return RATE_FMT;
    default:
      return undefined;
  }
}

function setCell(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string | number,
  format?: string,
): void {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell: XLSX.CellObject = { v: value, t: typeof value === 'number' ? 'n' : 's' };
  if (format) cell.z = format;
  sheet[ref] = cell;
}

function totalsValue(
  schedule: ScheduleOfRealEstate,
  key: keyof ScheduleRow | 'lineNumber',
): string | number {
  if (key === 'lineNumber') return '';
  if (key === 'propertyDescription') return 'TOTAL';
  if (key === 'propertyType' || key === 'dateAcquired' || key === 'remainingTerm' || key === 'notes') {
    return '';
  }
  if (key === 'financingType') return `${schedule.propertyCount} properties`;
  if (key === 'ownershipPercent') return '';

  const totalsKey = key as keyof ScheduleOfRealEstate['totals'];
  if (totalsKey in schedule.totals) {
    return schedule.totals[totalsKey];
  }
  return '';
}

export function buildScheduleWorkbook(schedule: ScheduleOfRealEstate): XLSX.WorkBook {
  const sheet: XLSX.WorkSheet = {};
  const cols = SCHEDULE_EXCEL_COLUMNS;

  setCell(sheet, 0, 0, schedule.title);
  setCell(sheet, 1, 0, `Prepared as of: ${schedule.asOfLabel}`);
  setCell(
    sheet,
    2,
    0,
    `Properties: ${schedule.propertyCount} · Simulation month ${schedule.simulationMonth}`,
  );

  const headerRow = 4;
  cols.forEach((col, index) => {
    setCell(sheet, headerRow, index, col.label);
  });

  schedule.rows.forEach((row, rowIndex) => {
    const r = headerRow + 1 + rowIndex;
    cols.forEach((col, colIndex) => {
      const value = cellValue(row, col.key, rowIndex + 1);
      setCell(sheet, r, colIndex, value, cellFormat(col.format));
    });
  });

  const totalsRow = headerRow + 1 + schedule.rows.length;
  cols.forEach((col, colIndex) => {
    const value = totalsValue(schedule, col.key);
    setCell(sheet, totalsRow, colIndex, value, cellFormat(col.format));
  });

  const lastRow = totalsRow;
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: cols.length - 1 },
  });
  sheet['!cols'] = cols.map((col) => ({ wch: col.width }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule of Real Estate');
  return workbook;
}

export function downloadScheduleExcel(schedule: ScheduleOfRealEstate): void {
  const workbook = buildScheduleWorkbook(schedule);
  const filename = `schedule-of-real-estate-${schedule.asOfDate}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
