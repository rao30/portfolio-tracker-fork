import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_METRICS = new Set(['monthsToPayoff', 'totalInterest', 'interestSaved']);

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
    metric: row.metric,
    budgetMin: Number(row.budget_min),
    budgetMax: Number(row.budget_max),
    budgetStep: Number(row.budget_step),
    isCollapsed: Boolean(row.is_collapsed),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.metric !== undefined && !VALID_METRICS.has(body.metric)) {
    errors.push('metric must be monthsToPayoff, totalInterest, or interestSaved');
  }

  for (const [key, min, max] of [
    ['budgetMin', 0, 1_000_000],
    ['budgetMax', 0, 1_000_000],
    ['budgetStep', 100, 5000],
  ]) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < min || n > max) {
        errors.push(`${key} must be between ${min} and ${max}`);
      }
    }
  }

  const min = body.budgetMin !== undefined ? Number(body.budgetMin) : null;
  const max = body.budgetMax !== undefined ? Number(body.budgetMax) : null;
  if (min != null && max != null && max <= min) {
    errors.push('budgetMax must be greater than budgetMin');
  }

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  return errors;
}

export async function getPayoffLandscapePreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('payoff_landscape_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      metric: 'monthsToPayoff',
      budgetMin: 0,
      budgetMax: 5000,
      budgetStep: 500,
      isCollapsed: false,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertPayoffLandscapePreferences(userId, body) {
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

  if (body.metric !== undefined) row.metric = body.metric;
  if (body.budgetMin !== undefined) row.budget_min = body.budgetMin;
  if (body.budgetMax !== undefined) row.budget_max = body.budgetMax;
  if (body.budgetStep !== undefined) row.budget_step = body.budgetStep;
  if (body.isCollapsed !== undefined) row.is_collapsed = body.isCollapsed;

  const { data, error } = await client
    .from('payoff_landscape_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isPayoffLandscapeEnabled() {
  return Boolean(getSupabase());
}
