import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_STRATEGIES = new Set([
  'highestRate',
  'highestPiPerDollar',
  'highestCashflowBoost',
  'lowestBalance',
  'lowestDscr',
  'highestInterestCost',
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
    lastExploredBudget:
      row.last_explored_budget != null ? Number(row.last_explored_budget) : null,
    pinnedVerdictStrategy: row.pinned_verdict_strategy ?? null,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.lastExploredBudget !== undefined && body.lastExploredBudget !== null) {
    const budget = Number(body.lastExploredBudget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) {
      errors.push('lastExploredBudget must be between 0 and 1,000,000');
    }
  }

  if (
    body.pinnedVerdictStrategy !== undefined &&
    body.pinnedVerdictStrategy !== null &&
    !VALID_STRATEGIES.has(body.pinnedVerdictStrategy)
  ) {
    errors.push(
      `pinnedVerdictStrategy must be one of: ${[...VALID_STRATEGIES].join(', ')}`,
    );
  }

  return errors;
}

export async function getDecisionPulsePreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('decision_pulse_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      lastExploredBudget: null,
      pinnedVerdictStrategy: null,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertDecisionPulsePreferences(userId, body) {
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
  if (body.lastExploredBudget !== undefined) {
    row.last_explored_budget = body.lastExploredBudget;
  }
  if (body.pinnedVerdictStrategy !== undefined) {
    row.pinned_verdict_strategy = body.pinnedVerdictStrategy;
  }

  const { data, error } = await client
    .from('decision_pulse_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isDecisionPulseEnabled() {
  return Boolean(getSupabase());
}
