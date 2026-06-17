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

export const MAX_PINNED_SCENARIOS = 6;

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

export function isStrategyLabEnabled() {
  return Boolean(getSupabase());
}

function normalizeName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Scenario name is required');
  if (trimmed.length > 80) throw new Error('Scenario name must be 80 characters or fewer');
  return trimmed;
}

function normalizeBudget(value) {
  const budget = Number(value);
  if (!Number.isFinite(budget)) throw new Error('extraMonthlyBudget must be a number');
  if (budget < 0 || budget > 1_000_000) {
    throw new Error('extraMonthlyBudget must be between 0 and 1,000,000');
  }
  return budget;
}

function normalizeStrategy(strategyId) {
  const id = String(strategyId ?? '').trim();
  if (!VALID_STRATEGIES.has(id)) {
    throw new Error(`Invalid strategyId: ${id}`);
  }
  return id;
}

function normalizeNotes(notes) {
  if (notes == null || notes === '') return null;
  const text = String(notes);
  if (text.length > 500) throw new Error('Notes must be 500 characters or fewer');
  return text;
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    extraMonthlyBudget: Number(row.extra_monthly_budget),
    strategyId: row.strategy_id,
    isPinned: row.is_pinned,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStrategyLabScenarios(userId) {
  const client = getSupabase();
  if (!client) throw new Error('Strategy Lab requires Supabase');

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .select('*')
    .eq('user_id', userId)
    .eq('is_pinned', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list scenarios: ${error.message}`);
  return (data ?? []).map(mapRow);
}

async function countPinned(userId) {
  const client = getSupabase();
  const { count, error } = await client
    .from('strategy_lab_scenarios')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_pinned', true);

  if (error) throw new Error(`Failed to count scenarios: ${error.message}`);
  return count ?? 0;
}

export async function createStrategyLabScenario(userId, input) {
  const client = getSupabase();
  if (!client) throw new Error('Strategy Lab requires Supabase');

  const pinned = await countPinned(userId);
  if (pinned >= MAX_PINNED_SCENARIOS) {
    throw new Error(`You can pin at most ${MAX_PINNED_SCENARIOS} scenarios`);
  }

  const payload = {
    user_id: userId,
    name: normalizeName(input.name),
    extra_monthly_budget: normalizeBudget(input.extraMonthlyBudget),
    strategy_id: normalizeStrategy(input.strategyId),
    is_pinned: input.isPinned !== false,
    notes: normalizeNotes(input.notes),
    sort_order:
      typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
        ? Math.min(1000, Math.max(0, Math.floor(input.sortOrder)))
        : pinned,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A scenario with this name already exists');
    }
    throw new Error(`Failed to create scenario: ${error.message}`);
  }

  return mapRow(data);
}

export async function updateStrategyLabScenario(userId, scenarioId, input) {
  const client = getSupabase();
  if (!client) throw new Error('Strategy Lab requires Supabase');

  const patch = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.extraMonthlyBudget !== undefined) {
    patch.extra_monthly_budget = normalizeBudget(input.extraMonthlyBudget);
  }
  if (input.strategyId !== undefined) {
    patch.strategy_id = normalizeStrategy(input.strategyId);
  }
  if (input.isPinned !== undefined) patch.is_pinned = Boolean(input.isPinned);
  if (input.notes !== undefined) patch.notes = normalizeNotes(input.notes);
  if (input.sortOrder !== undefined) {
    patch.sort_order = Math.min(1000, Math.max(0, Math.floor(Number(input.sortOrder))));
  }

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .update(patch)
    .eq('id', scenarioId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A scenario with this name already exists');
    }
    throw new Error(`Failed to update scenario: ${error.message}`);
  }
  if (!data) throw new Error('Scenario not found');
  return mapRow(data);
}

export async function deleteStrategyLabScenario(userId, scenarioId) {
  const client = getSupabase();
  if (!client) throw new Error('Strategy Lab requires Supabase');

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .delete()
    .eq('id', scenarioId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to delete scenario: ${error.message}`);
  if (!data) throw new Error('Scenario not found');
  return { ok: true };
}
