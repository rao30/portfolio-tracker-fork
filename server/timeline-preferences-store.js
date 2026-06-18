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
    focusedPropertyIndex: Number(row.focused_property_index ?? 0),
    lastExploredPlanId: row.last_explored_plan_id ?? null,
    showCommittedGhost: row.show_committed_ghost !== false,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.focusedPropertyIndex !== undefined) {
    const index = Number(body.focusedPropertyIndex);
    if (!Number.isInteger(index) || index < 0 || index >= 1000) {
      errors.push('focusedPropertyIndex must be between 0 and 999');
    }
  }

  if (
    body.lastExploredPlanId !== undefined &&
    body.lastExploredPlanId !== null &&
    typeof body.lastExploredPlanId !== 'string'
  ) {
    errors.push('lastExploredPlanId must be a string or null');
  }

  if (body.showCommittedGhost !== undefined && typeof body.showCommittedGhost !== 'boolean') {
    errors.push('showCommittedGhost must be a boolean');
  }

  return errors;
}

export async function getTimelinePreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('timeline_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      focusedPropertyIndex: 0,
      lastExploredPlanId: null,
      showCommittedGhost: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertTimelinePreferences(userId, body) {
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
  if (body.lastExploredPlanId !== undefined) {
    row.last_explored_plan_id = body.lastExploredPlanId;
  }
  if (body.showCommittedGhost !== undefined) {
    row.show_committed_ghost = body.showCommittedGhost;
  }

  const { data, error } = await client
    .from('timeline_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isTimelinePreferencesEnabled() {
  return Boolean(getSupabase());
}
