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
    lastExploredW2Income:
      row.last_explored_w2_income != null ? Number(row.last_explored_w2_income) : null,
    lastExploredCarryover:
      row.last_explored_carryover != null ? Number(row.last_explored_carryover) : null,
    incomeStep: row.income_step != null ? Number(row.income_step) : 10_000,
    showPropertyBreakdown: row.show_property_breakdown !== false,
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.lastExploredW2Income !== undefined && body.lastExploredW2Income !== null) {
    const income = Number(body.lastExploredW2Income);
    if (!Number.isFinite(income) || income < 0 || income > 10_000_000) {
      errors.push('lastExploredW2Income must be between 0 and 10,000,000');
    }
  }

  if (body.lastExploredCarryover !== undefined && body.lastExploredCarryover !== null) {
    const carryover = Number(body.lastExploredCarryover);
    if (!Number.isFinite(carryover) || carryover < 0 || carryover > 10_000_000) {
      errors.push('lastExploredCarryover must be between 0 and 10,000,000');
    }
  }

  if (body.incomeStep !== undefined) {
    const step = Number(body.incomeStep);
    if (!Number.isFinite(step) || step < 1_000 || step > 100_000) {
      errors.push('incomeStep must be between 1,000 and 100,000');
    }
  }

  if (
    body.showPropertyBreakdown !== undefined &&
    typeof body.showPropertyBreakdown !== 'boolean'
  ) {
    errors.push('showPropertyBreakdown must be a boolean');
  }

  return errors;
}

export async function getTaxShieldPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('tax_shield_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      lastExploredW2Income: null,
      lastExploredCarryover: null,
      incomeStep: 10_000,
      showPropertyBreakdown: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertTaxShieldPreferences(userId, body) {
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
  if (body.lastExploredW2Income !== undefined) {
    row.last_explored_w2_income = body.lastExploredW2Income;
  }
  if (body.lastExploredCarryover !== undefined) {
    row.last_explored_carryover = body.lastExploredCarryover;
  }
  if (body.incomeStep !== undefined) {
    row.income_step = Math.round(Number(body.incomeStep));
  }
  if (body.showPropertyBreakdown !== undefined) {
    row.show_property_breakdown = body.showPropertyBreakdown;
  }

  const { data, error } = await client
    .from('tax_shield_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isTaxShieldEnabled() {
  return Boolean(getSupabase());
}
