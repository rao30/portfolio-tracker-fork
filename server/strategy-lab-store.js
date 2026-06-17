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

export function isStrategyLabEnabled() {
  return Boolean(getSupabase());
}

function normalizeName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    throw new Error('Scenario name is required');
  }
  if (trimmed.length > 80) {
    throw new Error('Scenario name must be 80 characters or fewer');
  }
  return trimmed;
}

function normalizeBudget(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new Error('Budget must be between 0 and 1,000,000');
  }
  return Math.round(n * 100) / 100;
}

function normalizeStrategy(strategyId) {
  const id = String(strategyId ?? '').trim();
  if (!VALID_STRATEGIES.has(id)) {
    throw new Error('Invalid payoff strategy');
  }
  return id;
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
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .select('*')
    .eq('user_id', userId)
    .eq('is_pinned', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load scenarios: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

export async function createStrategyLabScenario(userId, input) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const name = normalizeName(input.name);
  const extraMonthlyBudget = normalizeBudget(input.extraMonthlyBudget);
  const strategyId = normalizeStrategy(input.strategyId);
  const notes =
    input.notes == null || input.notes === ''
      ? null
      : String(input.notes).slice(0, 500);

  const { count, error: countError } = await client
    .from('strategy_lab_scenarios')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_pinned', true);

  if (countError) {
    throw new Error(`Failed to check scenario limit: ${countError.message}`);
  }

  if ((count ?? 0) >= 12) {
    throw new Error('Maximum of 12 pinned scenarios reached');
  }

  const { data, error } = await client
    .from('strategy_lab_scenarios')
    .insert({
      user_id: userId,
      name,
      extra_monthly_budget: extraMonthlyBudget,
      strategy_id: strategyId,
      is_pinned: true,
      notes,
      sort_order: typeof input.sortOrder === 'number' ? input.sortOrder : count ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A scenario with this name already exists');
    }
    throw new Error(`Failed to save scenario: ${error.message}`);
  }

  return mapRow(data);
}

export async function deleteStrategyLabScenario(userId, scenarioId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { error, count } = await client
    .from('strategy_lab_scenarios')
    .delete({ count: 'exact' })
    .eq('id', scenarioId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete scenario: ${error.message}`);
  }

  if (!count) {
    throw new Error('Scenario not found');
  }
}
