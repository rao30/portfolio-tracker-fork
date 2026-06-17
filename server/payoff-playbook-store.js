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

function rowToPlaybook(row) {
  return {
    propertyOrder: Array.isArray(row.property_order) ? row.property_order : [],
    baseStrategy: row.base_strategy ?? null,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function validatePropertyOrder(order) {
  if (!Array.isArray(order)) {
    return { ok: false, error: 'propertyOrder must be an array' };
  }
  if (order.length > 200) {
    return { ok: false, error: 'propertyOrder must have at most 200 entries' };
  }
  const seen = new Set();
  for (const name of order) {
    if (typeof name !== 'string' || !name.trim()) {
      return { ok: false, error: 'propertyOrder entries must be non-empty strings' };
    }
    if (seen.has(name)) {
      return { ok: false, error: `duplicate property in order: ${name}` };
    }
    seen.add(name);
  }
  return { ok: true, order };
}

function validatePayload(body) {
  const errors = [];

  if (body.propertyOrder !== undefined) {
    const check = validatePropertyOrder(body.propertyOrder);
    if (!check.ok) errors.push(check.error);
  } else {
    errors.push('propertyOrder is required');
  }

  if (body.baseStrategy !== undefined && body.baseStrategy !== null) {
    if (!VALID_STRATEGIES.has(body.baseStrategy)) {
      errors.push(`baseStrategy must be one of: ${[...VALID_STRATEGIES].join(', ')}`);
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  return errors;
}

export async function getPayoffPlaybook(userId) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const { data, error } = await client
    .from('payoff_playbooks')
    .select('property_order, base_strategy, is_active, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToPlaybook(data);
}

export async function upsertPayoffPlaybook(userId, body) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const errors = validatePayload(body);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const orderCheck = validatePropertyOrder(body.propertyOrder);
  const payload = {
    user_id: userId,
    property_order: orderCheck.order,
    base_strategy: body.baseStrategy ?? null,
    is_active: body.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('payoff_playbooks')
    .upsert(payload, { onConflict: 'user_id' })
    .select('property_order, base_strategy, is_active, updated_at')
    .single();

  if (error) throw error;
  return rowToPlaybook(data);
}

export async function deletePayoffPlaybook(userId) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const { error } = await client
    .from('payoff_playbooks')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

export function isPayoffPlaybookEnabled() {
  return Boolean(getSupabase());
}
