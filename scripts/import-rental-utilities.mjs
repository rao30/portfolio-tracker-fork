/**
 * Import landlord-paid utilities from Zillow-style rental income workbooks.
 * Usage: node scripts/import-rental-utilities.mjs "path/to/rental income2025.xlsx"
 */
import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const MONTH_COLS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

const SHEET_TO_PROPERTY = {
  '731 Lisa': 'Lisa Ln (Cedar Hill)',
  '314 Brookwood': 'Brookwood (Duncanville)',
  '1928 Wendy St': 'Wendy (Irving)',
  '1238 Ridge Rock Ln': 'Ridge Rock (Duncanville)',
  '2717 E Park Blvd': 'Park Blvd (Plano, projected post-move-out)',
};

function categorize(label) {
  const L = label.toLowerCase();
  if (L.includes('cleaning')) return 'cleaning_maintenance';
  if (L.includes('yard') || L.includes('snow')) return 'yard_snow_removal';
  if (L.includes('garbage')) return 'garbage';
  if (L === 'gas' || L.startsWith('gas')) return 'gas';
  if (L.includes('electric')) return 'electricity';
  if (L.includes('water')) return 'water_sewer';
  if (L.includes('hoa')) return 'hoa_dues';
  if (L.includes('internet')) return 'internet';
  if (L === 'other:' || L === 'other') return 'other';
  return null;
}

function parseSheet(ws) {
  const breakdown = {};
  for (let r = 56; r <= 64; r++) {
    const label = (ws[`A${r}`]?.v ?? '').toString().trim();
    const cat = categorize(label);
    if (!cat) continue;
    let rowSum = 0;
    let activeMonths = 0;
    for (const c of MONTH_COLS) {
      const v = ws[`${c}${r}`]?.v;
      if (typeof v === 'number' && v > 0) activeMonths++;
      if (typeof v === 'number') rowSum += v;
    }
    if (rowSum <= 0) continue;
    const months = activeMonths > 0 ? activeMonths : 12;
    breakdown[cat] = Math.round((rowSum / months) * 100) / 100;
  }
  return breakdown;
}

function extrapolate(sheetName, breakdown) {
  if (sheetName === '1238 Ridge Rock Ln' && !breakdown.electricity) {
    breakdown.electricity = 476;
  }
  if (sheetName === '2717 E Park Blvd') {
    const wsNote = 'Dec 2025 only; using observed month totals';
    return { breakdown, note: wsNote };
  }
  return { breakdown };
}

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/import-rental-utilities.mjs <workbook.xlsx>');
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath, { cellDates: true });
const updates = {};

for (const sheetName of wb.SheetNames) {
  const propertyName = SHEET_TO_PROPERTY[sheetName];
  if (!propertyName) continue;
  const ws = wb.Sheets[sheetName];
  let breakdown = parseSheet(ws);
  ({ breakdown } = extrapolate(sheetName, breakdown));
  updates[propertyName] = breakdown;
  console.log(propertyName, breakdown);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const portfolioPath = join(root, 'public/data/portfolio.json');
const portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8'));

for (const prop of portfolio.properties) {
  const breakdown = updates[prop.name];
  if (!breakdown) continue;
  delete prop.utilities_rent_rate;
  prop.utility_breakdown = breakdown;
  delete prop.monthly_utilities;
}

portfolio.seed_version = (portfolio.seed_version ?? 0) + 1;
writeFileSync(portfolioPath, `${JSON.stringify(portfolio, null, 2)}\n`);
console.log(`Updated portfolio.json (seed_version ${portfolio.seed_version})`);
