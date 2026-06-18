import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_MODULES = new Set([
  'pulse',
  'assumptions',
  'balloon',
  'landscape',
  'stress',
  'timeline',
  'velocity',
  'snapshot',
  'playbook',
  'lab',
  'goals',
]);

let supabase = null;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!supabase) {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return supabase;
}

function rowToPreferences(row) {
  return {
    activeModule: row.active_module,
    collapsedModules: Array.isArray(row.collapsed_modules)
      ? row.collapsed_modules.filter((id) => VALID_MODULES.has(id))
      : [],
    showHeroStrip: Boolean(row.show_hero_strip),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.activeModule !== undefined) {
    if (!VALID_MODULES.has(body.activeModule)) {
      errors.push(
        `activeModule must be one of: ${[...VALID_MODULES].join(', ')}`,
      );
    }
  }

  if (body.collapsedModules !== undefined) {
    if (!Array.isArray(body.collapsedModules)) {
      errors.push('collapsedModules must be an array');
    } else {
      for (const id of body.collapsedModules) {
        if (!VALID_MODULES.has(id)) {
          errors.push(`Invalid collapsed module id: ${id}`);
        }
      }
    }
  }

  if (body.showHeroStrip !== undefined && typeof body.showHeroStrip !== 'boolean') {
    errors.push('showHeroStrip must be a boolean');
  }

  return errors;
}

export async function getMobileMissionControlPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('mobile_mission_control_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      activeModule: 'pulse',
      collapsedModules: [],
      showHeroStrip: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertMobileMissionControlPreferences(userId, body) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const errors = validatePayload(body);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }

  const row = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (body.activeModule !== undefined) row.active_module = body.activeModule;
  if (body.collapsedModules !== undefined) {
    row.collapsed_modules = body.collapsedModules;
  }
  if (body.showHeroStrip !== undefined) row.show_hero_strip = body.showHeroStrip;

  const { data, error } = await client
    .from('mobile_mission_control_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isMobileMissionControlEnabled() {
  return Boolean(getSupabase());
}
