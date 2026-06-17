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
    activeGoalType: row.active_goal_type ?? 'debtFree',
    debtFreeTargetMonth: Number(row.debt_free_target_month ?? 180),
    equityTargetMonth: Number(row.equity_target_month ?? 180),
    equityTargetValue: Number(row.equity_target_value ?? 2_000_000),
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

  if (
    body.activeGoalType !== undefined &&
    !['debtFree', 'equity'].includes(body.activeGoalType)
  ) {
    errors.push('activeGoalType must be debtFree or equity');
  }

  if (body.debtFreeTargetMonth !== undefined) {
    const month = Number(body.debtFreeTargetMonth);
    if (!Number.isFinite(month) || month < 12 || month > 600) {
      errors.push('debtFreeTargetMonth must be between 12 and 600');
    }
  }

  if (body.equityTargetMonth !== undefined) {
    const month = Number(body.equityTargetMonth);
    if (!Number.isFinite(month) || month < 12 || month > 600) {
      errors.push('equityTargetMonth must be between 12 and 600');
    }
  }

  if (body.equityTargetValue !== undefined) {
    const value = Number(body.equityTargetValue);
    if (!Number.isFinite(value) || value < 100_000 || value > 1_000_000_000) {
      errors.push('equityTargetValue must be between 100,000 and 1,000,000,000');
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

export async function getGoalCommandPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('goal_command_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      activeGoalType: 'debtFree',
      debtFreeTargetMonth: 180,
      equityTargetMonth: 180,
      equityTargetValue: 2_000_000,
      lastExploredBudget: null,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertGoalCommandPreferences(userId, body) {
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
  if (body.activeGoalType !== undefined) row.active_goal_type = body.activeGoalType;
  if (body.debtFreeTargetMonth !== undefined) {
    row.debt_free_target_month = Math.round(Number(body.debtFreeTargetMonth));
  }
  if (body.equityTargetMonth !== undefined) {
    row.equity_target_month = Math.round(Number(body.equityTargetMonth));
  }
  if (body.equityTargetValue !== undefined) {
    row.equity_target_value = Math.round(Number(body.equityTargetValue));
  }
  if (body.lastExploredBudget !== undefined) {
    row.last_explored_budget = body.lastExploredBudget;
  }

  const { data, error } = await client
    .from('goal_command_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isGoalCommandEnabled() {
  return Boolean(getSupabase());
}
