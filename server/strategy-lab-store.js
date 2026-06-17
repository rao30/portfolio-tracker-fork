import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const MAX_PINNED = 9;
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

function rowToScenario(row) {
  return {
    id: row.id,
    name: row.name,
    extraMonthlyBudget: Number(row.extra_monthly_budget),
    strategyId: row.strategy_id,
    scenario: row.scenario ?? null,
    isPinned: row.is_pinned,
    notes: row.notes ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) errors.push('name is required');
    else if (name.length > 80) errors.push('name must be at most 80 characters');
  }

  if (!partial || body.extraMonthlyBudget !== undefined) {
    const budget = Number(body.extraMonthlyBudget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) {
      errors.push('extraMonthlyBudget must be between 0 and 1,000,000');
    }
  }

  if (!partial || body.strategyId !== undefined) {
    if (!VALID_STRATEGIES.has(body.strategyId)) {
      errors.push(`strategyId must be one of: ${[...VALID_STRATEGIES].join(', ')}`);
    }
  }

  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string' || body.notes.length > 500) {
      errors.push('notes must be at most 500 characters');
    }
  }

  if (body.scenario !== undefined && body.scenario !== null) {
    if (typeof body.scenario !== 'object' || Array.isArray(body.scenario)) {
      errors.push('scenario must be a JSON object or null');
    } else if (!body.scenario.id || typeof body.scenario.id !== 'string') {
      errors.push('scenario.id is required');
    }
  }

  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isInteger(order) || order < 1 || order > MAX_PINNED) {
      errors.push(`sortOrder must be an integer from 1 to ${MAX_PINNED}`);
    }
  }

  return errors;
}

export async function listStrategyLabScenarios(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .select('*')
    .eq('user_id', userId)
    .eq('is_pinned', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to list strategy lab scenarios: ${error.message}`);
  }

  return (data ?? []).map(rowToScenario);
}

async function nextSortOrder(client, userId) {
  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .select('sort_order')
    .eq('user_id', userId)
    .eq('is_pinned', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to resolve sort order: ${error.message}`);
  }

  const used = new Set((data ?? []).map((r) => r.sort_order));
  for (let slot = 1; slot <= MAX_PINNED; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  throw new Error(`Maximum of ${MAX_PINNED} pinned scenarios reached`);
}

export async function createStrategyLabScenario(userId, body) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const errors = validatePayload(body);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const sortOrder =
    body.sortOrder !== undefined ? Number(body.sortOrder) : await nextSortOrder(client, userId);

  const payload = {
    user_id: userId,
    name: body.name.trim(),
    extra_monthly_budget: Number(body.extraMonthlyBudget),
    strategy_id: body.strategyId,
    scenario: body.scenario ?? null,
    is_pinned: body.isPinned !== false,
    notes: body.notes?.trim() || null,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const err = new Error(
        error.message.includes('user_name')
          ? 'A scenario with this name already exists'
          : 'That pin slot is already taken',
      );
      err.statusCode = 409;
      throw err;
    }
    throw new Error(`Failed to create strategy lab scenario: ${error.message}`);
  }

  return rowToScenario(data);
}

export async function updateStrategyLabScenario(userId, scenarioId, body) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const errors = validatePayload(body, { partial: true });
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const patch = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.extraMonthlyBudget !== undefined) {
    patch.extra_monthly_budget = Number(body.extraMonthlyBudget);
  }
  if (body.strategyId !== undefined) patch.strategy_id = body.strategyId;
  if (body.scenario !== undefined) patch.scenario = body.scenario;
  if (body.isPinned !== undefined) patch.is_pinned = body.isPinned;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder);

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .update(patch)
    .eq('id', scenarioId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      const err = new Error('A scenario with this name or slot already exists');
      err.statusCode = 409;
      throw err;
    }
    throw new Error(`Failed to update strategy lab scenario: ${error.message}`);
  }

  if (!data) {
    const err = new Error('Scenario not found');
    err.statusCode = 404;
    throw err;
  }

  return rowToScenario(data);
}

export async function deleteStrategyLabScenario(userId, scenarioId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .delete()
    .eq('id', scenarioId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete strategy lab scenario: ${error.message}`);
  }

  if (!data) {
    const err = new Error('Scenario not found');
    err.statusCode = 404;
    throw err;
  }

  return { ok: true };
}

function rowToPreferences(row) {
  return {
    isCollapsed: Boolean(row.is_collapsed),
    lastExploredPinId: row.last_explored_pin_id ?? null,
    committedPinId: row.committed_pin_id ?? null,
    updatedAt: row.updated_at,
  };
}

function validatePreferencesPayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  for (const field of ['lastExploredPinId', 'committedPinId']) {
    if (body[field] !== undefined && body[field] !== null) {
      if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
        errors.push(`${field} must be a non-empty string or null`);
      }
    }
  }

  return errors;
}

export async function getStrategyLabPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('strategy_lab_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      lastExploredPinId: null,
      committedPinId: null,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertStrategyLabPreferences(userId, body) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const errors = validatePreferencesPayload(body);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const row = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (body.isCollapsed !== undefined) row.is_collapsed = body.isCollapsed;
  if (body.lastExploredPinId !== undefined) {
    row.last_explored_pin_id = body.lastExploredPinId;
  }
  if (body.committedPinId !== undefined) {
    row.committed_pin_id = body.committedPinId;
  }

  const { data, error } = await client
    .from('strategy_lab_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isStrategyLabEnabled() {
  return Boolean(getSupabase());
}
