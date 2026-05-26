import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ws from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTFOLIO_ROW_ID = 'default';

let supabase = null;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!supabase) {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return supabase;
}

export function isCloudStorageEnabled() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key);
}

async function readSeedFile() {
  const seedPath = path.join(__dirname, '..', 'public', 'data', 'portfolio.json');
  const raw = await readFile(seedPath, 'utf8');
  return JSON.parse(raw);
}

export async function loadPortfolio() {
  const client = getSupabase();
  if (!client) {
    return { data: await readSeedFile(), source: 'file', updatedAt: null };
  }

  const { data: row, error } = await client
    .from('portfolio_snapshots')
    .select('data, updated_at')
    .eq('id', PORTFOLIO_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase read failed: ${error.message}`);
  }

  const seed = await readSeedFile();
  const seedVersion = typeof seed.seed_version === 'number' ? seed.seed_version : 0;

  if (row?.data) {
    const cloudVersion =
      typeof row.data.seed_version === 'number' ? row.data.seed_version : 0;
    if (cloudVersion >= seedVersion) {
      return {
        data: row.data,
        source: 'cloud',
        updatedAt: row.updated_at ?? null,
      };
    }

    const { error: upgradeError } = await client.from('portfolio_snapshots').upsert({
      id: PORTFOLIO_ROW_ID,
      data: seed,
      updated_at: new Date().toISOString(),
    });

    if (upgradeError) {
      throw new Error(`Supabase seed upgrade failed: ${upgradeError.message}`);
    }

    console.info(
      `Portfolio seed upgraded: cloud v${cloudVersion} → repo v${seedVersion}`,
    );

    return {
      data: seed,
      source: 'cloud',
      updatedAt: new Date().toISOString(),
      upgradedFromVersion: cloudVersion,
    };
  }

  const { error: insertError } = await client.from('portfolio_snapshots').upsert({
    id: PORTFOLIO_ROW_ID,
    data: seed,
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new Error(`Supabase seed failed: ${insertError.message}`);
  }

  return { data: seed, source: 'cloud', updatedAt: new Date().toISOString() };
}

export async function savePortfolio(portfolioData) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data: row, error } = await client
    .from('portfolio_snapshots')
    .upsert({
      id: PORTFOLIO_ROW_ID,
      data: portfolioData,
      updated_at: new Date().toISOString(),
    })
    .select('updated_at')
    .single();

  if (error) {
    throw new Error(`Supabase save failed: ${error.message}`);
  }

  return { updatedAt: row?.updated_at ?? new Date().toISOString() };
}

/** Overwrite cloud snapshot with the repo seed file (same as deploy defaults). */
export async function resetPortfolioToSeed() {
  const seed = await readSeedFile();
  const client = getSupabase();
  if (!client) {
    return { data: seed, source: 'file', updatedAt: null };
  }

  const { error } = await client.from('portfolio_snapshots').upsert({
    id: PORTFOLIO_ROW_ID,
    data: seed,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Supabase reset failed: ${error.message}`);
  }

  return { data: seed, source: 'cloud', updatedAt: new Date().toISOString() };
}
