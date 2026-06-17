import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ws from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LEGACY_PORTFOLIO_ROW_ID = 'default';

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

function resolveRowId(rowId) {
  return rowId ?? LEGACY_PORTFOLIO_ROW_ID;
}

export async function loadPortfolio(rowId = LEGACY_PORTFOLIO_ROW_ID) {
  const id = resolveRowId(rowId);
  const client = getSupabase();
  if (!client) {
    return { data: await readSeedFile(), source: 'file', updatedAt: null };
  }

  const { data: row, error } = await client
    .from('portfolio_snapshots')
    .select('data, updated_at')
    .eq('id', id)
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

    const upsertPayload = {
      id,
      data: seed,
      updated_at: new Date().toISOString(),
    };
    if (id !== LEGACY_PORTFOLIO_ROW_ID) {
      upsertPayload.user_id = id;
    }

    const { error: upgradeError } = await client
      .from('portfolio_snapshots')
      .upsert(upsertPayload);

    if (upgradeError) {
      throw new Error(`Supabase seed upgrade failed: ${upgradeError.message}`);
    }

    console.info(
      `Portfolio seed upgraded (${id}): cloud v${cloudVersion} → repo v${seedVersion}`,
    );

    return {
      data: seed,
      source: 'cloud',
      updatedAt: new Date().toISOString(),
      upgradedFromVersion: cloudVersion,
    };
  }

  const upsertPayload = {
    id,
    data: seed,
    updated_at: new Date().toISOString(),
  };
  if (id !== LEGACY_PORTFOLIO_ROW_ID) {
    upsertPayload.user_id = id;
  }

  const { error: insertError } = await client
    .from('portfolio_snapshots')
    .upsert(upsertPayload);

  if (insertError) {
    throw new Error(`Supabase seed failed: ${insertError.message}`);
  }

  return { data: seed, source: 'cloud', updatedAt: new Date().toISOString() };
}

export async function savePortfolio(portfolioData, rowId = LEGACY_PORTFOLIO_ROW_ID) {
  const id = resolveRowId(rowId);
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const upsertPayload = {
    id,
    data: portfolioData,
    updated_at: new Date().toISOString(),
  };
  if (id !== LEGACY_PORTFOLIO_ROW_ID) {
    upsertPayload.user_id = id;
  }

  const { data: row, error } = await client
    .from('portfolio_snapshots')
    .upsert(upsertPayload)
    .select('updated_at')
    .single();

  if (error) {
    throw new Error(`Supabase save failed: ${error.message}`);
  }

  return { updatedAt: row?.updated_at ?? new Date().toISOString() };
}

/** Overwrite cloud snapshot with the repo seed file. */
export async function resetPortfolioToSeed(rowId = LEGACY_PORTFOLIO_ROW_ID) {
  const id = resolveRowId(rowId);
  const seed = await readSeedFile();
  const client = getSupabase();
  if (!client) {
    return { data: seed, source: 'file', updatedAt: null };
  }

  const upsertPayload = {
    id,
    data: seed,
    updated_at: new Date().toISOString(),
  };
  if (id !== LEGACY_PORTFOLIO_ROW_ID) {
    upsertPayload.user_id = id;
  }

  const { error } = await client.from('portfolio_snapshots').upsert(upsertPayload);

  if (error) {
    throw new Error(`Supabase reset failed: ${error.message}`);
  }

  return { data: seed, source: 'cloud', updatedAt: new Date().toISOString() };
}

/** Copy legacy default row to a user id (bootstrap). */
export async function copyPortfolioRow(fromId, toId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data: source, error: readError } = await client
    .from('portfolio_snapshots')
    .select('data')
    .eq('id', fromId)
    .maybeSingle();

  if (readError) {
    throw new Error(`Supabase read failed: ${readError.message}`);
  }

  const data = source?.data ?? (await readSeedFile());

  const { error: upsertError } = await client.from('portfolio_snapshots').upsert({
    id: toId,
    user_id: toId,
    data,
    updated_at: new Date().toISOString(),
  });

  if (upsertError) {
    throw new Error(`Supabase copy failed: ${upsertError.message}`);
  }
}
