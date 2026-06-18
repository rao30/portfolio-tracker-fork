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

const VALID_MODES = new Set(['rate_term', 'cash_out', 'both']);

function rowToPreferences(row) {
  return {
    isCollapsed: Boolean(row.is_collapsed),
    pinnedProperty: row.pinned_property ?? null,
    analysisMode: row.analysis_mode,
    marketRate: Number(row.market_rate),
    closingCostPct: Number(row.closing_cost_pct),
    holdPeriodMonths: Number(row.hold_period_months),
    cashOutLtv: Number(row.cash_out_ltv),
    minDscr: Number(row.min_dscr),
    deploymentYield: Number(row.deployment_yield),
    refiTermMonths: Number(row.refi_term_months),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.pinnedProperty !== undefined && body.pinnedProperty !== null) {
    if (typeof body.pinnedProperty !== 'string' || body.pinnedProperty.trim().length === 0) {
      errors.push('pinnedProperty must be a non-empty string or null');
    }
  }

  if (body.analysisMode !== undefined) {
    if (!VALID_MODES.has(body.analysisMode)) {
      errors.push('analysisMode must be rate_term, cash_out, or both');
    }
  }

  if (body.marketRate !== undefined) {
    const v = Number(body.marketRate);
    if (!Number.isFinite(v) || v < 0.01 || v > 0.2) {
      errors.push('marketRate must be between 0.01 and 0.20');
    }
  }

  if (body.closingCostPct !== undefined) {
    const v = Number(body.closingCostPct);
    if (!Number.isFinite(v) || v < 0 || v > 0.1) {
      errors.push('closingCostPct must be between 0 and 0.10');
    }
  }

  if (body.holdPeriodMonths !== undefined) {
    const v = Number(body.holdPeriodMonths);
    if (!Number.isInteger(v) || v < 12 || v > 360) {
      errors.push('holdPeriodMonths must be an integer between 12 and 360');
    }
  }

  if (body.cashOutLtv !== undefined) {
    const v = Number(body.cashOutLtv);
    if (!Number.isFinite(v) || v < 0.5 || v > 0.85) {
      errors.push('cashOutLtv must be between 0.50 and 0.85');
    }
  }

  if (body.minDscr !== undefined) {
    const v = Number(body.minDscr);
    if (!Number.isFinite(v) || v < 0.5 || v > 2) {
      errors.push('minDscr must be between 0.50 and 2.0');
    }
  }

  if (body.deploymentYield !== undefined) {
    const v = Number(body.deploymentYield);
    if (!Number.isFinite(v) || v < 0 || v > 0.5) {
      errors.push('deploymentYield must be between 0 and 0.50');
    }
  }

  if (body.refiTermMonths !== undefined) {
    const v = Number(body.refiTermMonths);
    if (!Number.isInteger(v) || v < 60 || v > 480) {
      errors.push('refiTermMonths must be an integer between 60 and 480');
    }
  }

  return errors;
}

export async function getRefinanceRadarPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('refinance_radar_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      pinnedProperty: null,
      analysisMode: 'both',
      marketRate: 0.07,
      closingCostPct: 0.025,
      holdPeriodMonths: 60,
      cashOutLtv: 0.75,
      minDscr: 1.0,
      deploymentYield: 0.12,
      refiTermMonths: 360,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertRefinanceRadarPreferences(userId, body) {
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
  if (body.pinnedProperty !== undefined) row.pinned_property = body.pinnedProperty;
  if (body.analysisMode !== undefined) row.analysis_mode = body.analysisMode;
  if (body.marketRate !== undefined) row.market_rate = body.marketRate;
  if (body.closingCostPct !== undefined) row.closing_cost_pct = body.closingCostPct;
  if (body.holdPeriodMonths !== undefined) row.hold_period_months = body.holdPeriodMonths;
  if (body.cashOutLtv !== undefined) row.cash_out_ltv = body.cashOutLtv;
  if (body.minDscr !== undefined) row.min_dscr = body.minDscr;
  if (body.deploymentYield !== undefined) row.deployment_yield = body.deploymentYield;
  if (body.refiTermMonths !== undefined) row.refi_term_months = body.refiTermMonths;

  const { data, error } = await client
    .from('refinance_radar_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isRefinanceRadarEnabled() {
  return Boolean(getSupabase());
}
