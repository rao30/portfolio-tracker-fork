/**
 * Pull market values from RentCast AVM (Zillow Zestimate-style; Zillow has no public API).
 *
 * Usage:
 *   RENTCAST_API_KEY=... node scripts/fetch-market-values.mjs
 *   RENTCAST_API_KEY=... node scripts/fetch-market-values.mjs --dry-run
 *   RENTCAST_API_KEY=... node scripts/fetch-market-values.mjs --write public/data/portfolio.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { refreshPortfolioMarketValues } from '../server/market-values.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultPath = join(__dirname, '../public/data/portfolio.json');

const dryRun = process.argv.includes('--dry-run');
const writeArg = process.argv.find((a) => a.startsWith('--write'));
const portfolioPath = writeArg
  ? process.argv[process.argv.indexOf(writeArg) + 1] ?? defaultPath
  : defaultPath;

const portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8'));

const { results, errors, updatedAt } = await refreshPortfolioMarketValues(portfolio, {
  dryRun,
});

for (const row of results) {
  const delta =
    row.previous != null ? ` (${row.value - row.previous >= 0 ? '+' : ''}${row.value - row.previous})` : '';
  console.log(
    `${row.name}: $${row.value.toLocaleString()}${delta} [${row.source}] — ${row.address}`,
  );
}

if (errors.length > 0) {
  console.error('\nErrors:');
  for (const e of errors) {
    console.error(`  ${e.name}: ${e.error}`);
  }
}

if (!dryRun && results.length > 0) {
  writeFileSync(portfolioPath, `${JSON.stringify(portfolio, null, 2)}\n`, 'utf-8');
  console.log(`\nUpdated ${results.length} properties in ${portfolioPath} (${updatedAt})`);
} else if (dryRun) {
  console.log(`\nDry run — no file written (${results.length} properties would update)`);
}

process.exit(errors.length > 0 ? 1 : 0);
