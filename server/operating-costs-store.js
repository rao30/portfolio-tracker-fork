import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_PRESETS = new Set([
  'lean_self_managed',
  'typical',
  'agency_managed',
  'from_market_value',
]);
const VALID_ENTRY_MODES = new Set(['breakdown', 'lump_sum']);

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
    isCollapsed: Boolean(row.is_collapsed),
    focusedPropertyIndex: Number(row.focused_property_index),
    showScheduleE: row.show_schedule_e !== false,
    entryMode: row.entry_mode,
    lastExploredPreset: row.last_explored_preset,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.focusedPropertyIndex !== undefined) {
    const idx = Number(body.focusedPropertyIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 1000) {
      errors.push('focusedPropertyIndex must be between 0 and 999');
    }
  }

  if (body.showScheduleE !== undefined && typeof body.showScheduleE !== 'boolean') {
    errors.push('showScheduleE must be a boolean');
  }

  if (body.entryMode !== undefined && !VALID_ENTRY_MODES.has(body.entryMode)) {
    errors.push('entryMode must be breakdown or lump_sum');
  }

  if (
    body.lastExploredPreset !== undefined &&
    body.lastExploredPreset !== null &&
    !VALID_PRESETS.has(body.lastExploredPreset)
  ) {
    errors.push('lastExploredPreset must be a valid expense preset');
  }

  return errors;
}

export async function getOperatingCostsPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('operating_costs_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      focusedPropertyIndex: 0,
      showScheduleE: true,
      entryMode: 'breakdown',
      lastExploredPreset: null,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertOperatingCostsPreferences(userId, body) {
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

  if (body.isCollapsed !== undefined) row.is_collapsed = body.isCollapsed;
  if (body.focusedPropertyIndex !== undefined) {
    row.focused_property_index = Math.round(Number(body.focusedPropertyIndex));
  }
  if (body.showScheduleE !== undefined) row.show_schedule_e = body.showScheduleE;
  if (body.entryMode !== undefined) row.entry_mode = body.entryMode;
  if (body.lastExploredPreset !== undefined) {
    row.last_explored_preset = body.lastExploredPreset;
  }

  const { data, error } = await client
    .from('operating_costs_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isOperatingCostsEnabled() {
  return Boolean(getSupabase());
}
