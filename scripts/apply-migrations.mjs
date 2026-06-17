/**
 * Apply pending Supabase SQL migrations using the service role key.
 * Requires DATABASE_URL or SUPABASE_DB_URL (direct Postgres connection string).
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/apply-migrations.mjs
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL or SUPABASE_DB_URL to apply migrations.');
  process.exit(1);
}

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

const applied = new Set(
  (await client.query('SELECT filename FROM public.schema_migrations')).rows.map(
    (r) => r.filename,
  ),
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip ${file}`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  console.log(`apply ${file}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

await client.end();
console.log('Migrations complete.');
