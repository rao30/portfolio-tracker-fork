import { getSupabase } from './portfolio-store.js';

const VALID_STRATEGIES = new Set([
  'highestRate',
  'highestPiPerDollar',
  'highestCashflowBoost',
  'lowestBalance',
  'lowestDscr',
  'highestInterestCost',
]);

function normalizeScenario(row) {
  return {
    id: row.id,
    name: row.name,
    extraMonthlyBudget: Number(row.extra_monthly_budget),
    strategyId: row.strategy_id,
    isPinned: row.is_pinned,
    notes: row.notes ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) errors.push('name must not be empty');
    if (name.length > 80) errors.push('name must be at most 80 characters');
  }
  if (body.extraMonthlyBudget !== undefined) {
    const budget = Number(body.extraMonthlyBudget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) {
      errors.push('extraMonthlyBudget must be between 0 and 1,000,000');
    }
  }
  if (body.strategyId !== undefined && !VALID_STRATEGIES.has(body.strategyId)) {
    errors.push('strategyId is invalid');
  }
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string' || body.notes.length > 500) {
      errors.push('notes must be at most 500 characters');
    }
  }
  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 1000) {
      errors.push('sortOrder must be an integer between 0 and 1000');
    }
  }
  return errors;
}

export async function listStrategyLabScenarios(userId) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list scenarios: ${error.message}`);
  return (data ?? []).map(normalizeScenario);
}

export async function createStrategyLabScenario(userId, body) {
  const errors = validatePayload(body);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }

  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const name = String(body.name ?? 'Untitled').trim();
  const row = {
    user_id: userId,
    name,
    extra_monthly_budget: Number(body.extraMonthlyBudget ?? 0),
    strategy_id: body.strategyId ?? 'highestRate',
    is_pinned: body.isPinned !== false,
    notes: body.notes ?? null,
    sort_order: Number(body.sortOrder ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const err = new Error('A scenario with this name already exists');
      err.status = 409;
      throw err;
    }
    throw new Error(`Failed to create scenario: ${error.message}`);
  }

  return normalizeScenario(data);
}

export async function updateStrategyLabScenario(userId, scenarioId, body) {
  const errors = validatePayload(body);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }

  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const patch = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.extraMonthlyBudget !== undefined) {
    patch.extra_monthly_budget = Number(body.extraMonthlyBudget);
  }
  if (body.strategyId !== undefined) patch.strategy_id = body.strategyId;
  if (body.isPinned !== undefined) patch.is_pinned = Boolean(body.isPinned);
  if (body.notes !== undefined) patch.notes = body.notes;
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
      const err = new Error('A scenario with this name already exists');
      err.status = 409;
      throw err;
    }
    throw new Error(`Failed to update scenario: ${error.message}`);
  }
  if (!data) {
    const err = new Error('Scenario not found');
    err.status = 404;
    throw err;
  }

  return normalizeScenario(data);
}

export async function deleteStrategyLabScenario(userId, scenarioId) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .delete()
    .eq('id', scenarioId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to delete scenario: ${error.message}`);
  if (!data) {
    const err = new Error('Scenario not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}
