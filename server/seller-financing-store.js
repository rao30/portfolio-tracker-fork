import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_ENTRY_MODES = new Set(['cap_driven', 'balance_driven']);
const VALID_PRESETS = new Set([
  'yield_maintenance_5yr',
  'yield_maintenance_7yr',
  'short_balloon_3yr',
  'long_balloon_10yr',
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
    isCollapsed: Boolean(row.is_collapsed),
    focusedPropertyIndex: Number(row.focused_property_index),
    entryMode: row.entry_mode,
    lastExploredPreset: row.last_explored_preset ?? null,
    showAmortizationChart: row.show_amortization_chart !== false,
    showRefiImpact: row.show_refi_impact !== false,
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
    if (!Number.isInteger(idx) || idx < 0 || idx > 999) {
      errors.push('focusedPropertyIndex must be an integer between 0 and 999');
    }
  }

  if (body.entryMode !== undefined && !VALID_ENTRY_MODES.has(body.entryMode)) {
    errors.push('entryMode must be cap_driven or balance_driven');
  }

  if (
    body.lastExploredPreset !== undefined &&
    body.lastExploredPreset !== null &&
    !VALID_PRESETS.has(body.lastExploredPreset)
  ) {
    errors.push(
      `lastExploredPreset must be one of: ${[...VALID_PRESETS].join(', ')}`,
    );
  }

  if (
    body.showAmortizationChart !== undefined &&
    typeof body.showAmortizationChart !== 'boolean'
  ) {
    errors.push('showAmortizationChart must be a boolean');
  }

  if (body.showRefiImpact !== undefined && typeof body.showRefiImpact !== 'boolean') {
    errors.push('showRefiImpact must be a boolean');
  }

  return errors;
}

export async function getSellerFinancingPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('seller_financing_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      focusedPropertyIndex: 0,
      entryMode: 'cap_driven',
      lastExploredPreset: null,
      showAmortizationChart: true,
      showRefiImpact: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertSellerFinancingPreferences(userId, body) {
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
  if (body.entryMode !== undefined) row.entry_mode = body.entryMode;
  if (body.lastExploredPreset !== undefined) {
    row.last_explored_preset = body.lastExploredPreset;
  }
  if (body.showAmortizationChart !== undefined) {
    row.show_amortization_chart = body.showAmortizationChart;
  }
  if (body.showRefiImpact !== undefined) {
    row.show_refi_impact = body.showRefiImpact;
  }

  const { data, error } = await client
    .from('seller_financing_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isSellerFinancingEnabled() {
  return Boolean(getSupabase());
}
