import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

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
    pinnedProperty: row.pinned_property ?? null,
    showCleared: row.show_cleared !== false,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.showCleared !== undefined && typeof body.showCleared !== 'boolean') {
    errors.push('showCleared must be a boolean');
  }

  if (body.pinnedProperty !== undefined && body.pinnedProperty !== null) {
    if (typeof body.pinnedProperty !== 'string' || body.pinnedProperty.trim().length === 0) {
      errors.push('pinnedProperty must be a non-empty string or null');
    }
  }

  return errors;
}

export async function getBalloonSafetyPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('balloon_safety_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      pinnedProperty: null,
      showCleared: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertBalloonSafetyPreferences(userId, body) {
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
  if (body.showCleared !== undefined) row.show_cleared = body.showCleared;
  if (body.pinnedProperty !== undefined) {
    row.pinned_property = body.pinnedProperty;
  }

  const { data, error } = await client
    .from('balloon_safety_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isBalloonSafetyEnabled() {
  return Boolean(getSupabase());
}
