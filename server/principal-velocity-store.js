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

const VIEW_MODES = ['monthly', 'cumulative', 'stacked'];
const HORIZON_VALUES = [12, 36, 60, 120, 180, 360];

function rowToPreferences(row) {
  return {
    isCollapsed: Boolean(row.is_collapsed),
    viewMode: row.view_mode ?? 'monthly',
    horizonMonths: Number(row.horizon_months ?? 120),
    showBaselineComparison: Boolean(row.show_baseline_comparison ?? true),
    pinnedPropertyName: row.pinned_property ?? null,
    lastExploredBudget:
      row.last_explored_budget != null ? Number(row.last_explored_budget) : null,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.viewMode !== undefined && !VIEW_MODES.includes(body.viewMode)) {
    errors.push('viewMode must be monthly, cumulative, or stacked');
  }

  if (body.horizonMonths !== undefined) {
    const horizon = Number(body.horizonMonths);
    if (!Number.isFinite(horizon) || !HORIZON_VALUES.includes(horizon)) {
      errors.push('horizonMonths must be one of 12, 36, 60, 120, 180, 360');
    }
  }

  if (
    body.showBaselineComparison !== undefined &&
    typeof body.showBaselineComparison !== 'boolean'
  ) {
    errors.push('showBaselineComparison must be a boolean');
  }

  if (body.pinnedPropertyName !== undefined && body.pinnedPropertyName !== null) {
    const name = String(body.pinnedPropertyName).trim();
    if (name.length === 0 || name.length > 200) {
      errors.push('pinnedPropertyName must be 1–200 characters when set');
    }
  }

  if (body.lastExploredBudget !== undefined && body.lastExploredBudget !== null) {
    const budget = Number(body.lastExploredBudget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) {
      errors.push('lastExploredBudget must be between 0 and 1,000,000');
    }
  }

  return errors;
}

export async function getPrincipalVelocityPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('principal_velocity_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      viewMode: 'monthly',
      horizonMonths: 120,
      showBaselineComparison: true,
      pinnedPropertyName: null,
      lastExploredBudget: null,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertPrincipalVelocityPreferences(userId, body) {
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
  if (body.viewMode !== undefined) row.view_mode = body.viewMode;
  if (body.horizonMonths !== undefined) {
    row.horizon_months = Math.round(Number(body.horizonMonths));
  }
  if (body.showBaselineComparison !== undefined) {
    row.show_baseline_comparison = body.showBaselineComparison;
  }
  if (body.pinnedPropertyName !== undefined) {
    row.pinned_property =
      body.pinnedPropertyName == null
        ? null
        : String(body.pinnedPropertyName).trim();
  }
  if (body.lastExploredBudget !== undefined) {
    row.last_explored_budget = body.lastExploredBudget;
  }

  const { data, error } = await client
    .from('principal_velocity_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isPrincipalVelocityEnabled() {
  return Boolean(getSupabase());
}
