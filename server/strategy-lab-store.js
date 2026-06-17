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

const MAX_SCENARIOS = 6;

let supabase = null;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!supabase) {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return supabase;
}

function normalizeScenario(row) {
  return {
    id: row.id,
    name: row.name,
    extraMonthlyBudget: Number(row.extra_monthly_budget),
    strategyId: row.strategy_id,
    isPinned: row.is_pinned,
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateScenarioInput(input, { partial = false } = {}) {
  const errors = [];

  if (!partial || input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) errors.push('name is required');
    if (name.length > 80) errors.push('name must be 80 characters or fewer');
  }

  if (!partial || input.extraMonthlyBudget !== undefined) {
    const budget = Number(input.extraMonthlyBudget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) {
      errors.push('extraMonthlyBudget must be between 0 and 1,000,000');
    }
  }

  if (!partial || input.strategyId !== undefined) {
    if (!VALID_STRATEGIES.has(input.strategyId)) {
      errors.push('strategyId is invalid');
    }
  }

  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== 'string' || input.notes.length > 500) {
      errors.push('notes must be a string of 500 characters or fewer');
    }
  }

  if (input.sortOrder !== undefined) {
    const order = Number(input.sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 1000) {
      errors.push('sortOrder must be an integer between 0 and 1000');
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
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list strategy lab scenarios: ${error.message}`);
  }

  return (data ?? []).map(normalizeScenario);
}

export async function createStrategyLabScenario(userId, input) {
  const errors = validateScenarioInput(input);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { count, error: countError } = await client
    .from('strategy_lab_scenarios')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    throw new Error(`Failed to count strategy lab scenarios: ${countError.message}`);
  }

  if ((count ?? 0) >= MAX_SCENARIOS) {
    throw new Error(`You can pin at most ${MAX_SCENARIOS} scenarios`);
  }

  const sortOrder =
    typeof input.sortOrder === 'number'
      ? input.sortOrder
      : count ?? 0;

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      extra_monthly_budget: input.extraMonthlyBudget,
      strategy_id: input.strategyId,
      is_pinned: input.isPinned ?? true,
      notes: input.notes ?? null,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create strategy lab scenario: ${error.message}`);
  }

  return normalizeScenario(data);
}

export async function updateStrategyLabScenario(userId, scenarioId, input) {
  const errors = validateScenarioInput(input, { partial: true });
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const patch = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.extraMonthlyBudget !== undefined) {
    patch.extra_monthly_budget = input.extraMonthlyBudget;
  }
  if (input.strategyId !== undefined) patch.strategy_id = input.strategyId;
  if (input.isPinned !== undefined) patch.is_pinned = input.isPinned;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .update(patch)
    .eq('id', scenarioId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update strategy lab scenario: ${error.message}`);
  }

  if (!data) {
    throw new Error('Scenario not found');
  }

  return normalizeScenario(data);
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
    throw new Error('Scenario not found');
  }

  return { ok: true };
}

export async function reorderStrategyLabScenarios(userId, orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error('orderedIds must be a non-empty array');
  }

  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const updates = orderedIds.map((id, index) =>
    client
      .from('strategy_lab_scenarios')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new Error(`Failed to reorder scenarios: ${failed.error.message}`);
  }

  return listStrategyLabScenarios(userId);
}
