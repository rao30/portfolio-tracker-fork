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

const VALID_MODES = new Set(['hold', 'sell', 'exchange', 'all']);

function rowToPreferences(row) {
  return {
    isCollapsed: Boolean(row.is_collapsed),
    pinnedProperty: row.pinned_property ?? null,
    analysisMode: row.analysis_mode,
    sellAtMonth: Number(row.sell_at_month),
    closingCostPct: Number(row.closing_cost_pct),
    capitalGainsRate: Number(row.capital_gains_rate),
    recaptureRate: Number(row.recapture_rate),
    holdHorizonMonths: Number(row.hold_horizon_months),
    proceedsToDebtPct: Number(row.proceeds_to_debt_pct),
    showTaxBreakdown: Boolean(row.show_tax_breakdown),
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
      errors.push('analysisMode must be hold, sell, exchange, or all');
    }
  }

  if (body.sellAtMonth !== undefined) {
    const v = Number(body.sellAtMonth);
    if (!Number.isInteger(v) || v < 1 || v > 360) {
      errors.push('sellAtMonth must be an integer between 1 and 360');
    }
  }

  if (body.closingCostPct !== undefined) {
    const v = Number(body.closingCostPct);
    if (!Number.isFinite(v) || v < 0 || v > 0.15) {
      errors.push('closingCostPct must be between 0 and 0.15');
    }
  }

  if (body.capitalGainsRate !== undefined) {
    const v = Number(body.capitalGainsRate);
    if (!Number.isFinite(v) || v < 0 || v > 0.4) {
      errors.push('capitalGainsRate must be between 0 and 0.40');
    }
  }

  if (body.recaptureRate !== undefined) {
    const v = Number(body.recaptureRate);
    if (!Number.isFinite(v) || v < 0 || v > 0.35) {
      errors.push('recaptureRate must be between 0 and 0.35');
    }
  }

  if (body.holdHorizonMonths !== undefined) {
    const v = Number(body.holdHorizonMonths);
    if (!Number.isInteger(v) || v < 12 || v > 360) {
      errors.push('holdHorizonMonths must be an integer between 12 and 360');
    }
  }

  if (body.proceedsToDebtPct !== undefined) {
    const v = Number(body.proceedsToDebtPct);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      errors.push('proceedsToDebtPct must be between 0 and 1');
    }
  }

  if (body.showTaxBreakdown !== undefined && typeof body.showTaxBreakdown !== 'boolean') {
    errors.push('showTaxBreakdown must be a boolean');
  }

  return errors;
}

export async function getExitCompassPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('exit_compass_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      pinnedProperty: null,
      analysisMode: 'all',
      sellAtMonth: 12,
      closingCostPct: 0.06,
      capitalGainsRate: 0.15,
      recaptureRate: 0.25,
      holdHorizonMonths: 120,
      proceedsToDebtPct: 1.0,
      showTaxBreakdown: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertExitCompassPreferences(userId, body) {
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
  if (body.pinnedProperty !== undefined) {
    row.pinned_property = body.pinnedProperty;
  }
  if (body.analysisMode !== undefined) row.analysis_mode = body.analysisMode;
  if (body.sellAtMonth !== undefined) row.sell_at_month = Math.round(Number(body.sellAtMonth));
  if (body.closingCostPct !== undefined) row.closing_cost_pct = Number(body.closingCostPct);
  if (body.capitalGainsRate !== undefined) {
    row.capital_gains_rate = Number(body.capitalGainsRate);
  }
  if (body.recaptureRate !== undefined) row.recapture_rate = Number(body.recaptureRate);
  if (body.holdHorizonMonths !== undefined) {
    row.hold_horizon_months = Math.round(Number(body.holdHorizonMonths));
  }
  if (body.proceedsToDebtPct !== undefined) {
    row.proceeds_to_debt_pct = Number(body.proceedsToDebtPct);
  }
  if (body.showTaxBreakdown !== undefined) {
    row.show_tax_breakdown = body.showTaxBreakdown;
  }

  const { data, error } = await client
    .from('exit_compass_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isExitCompassEnabled() {
  return Boolean(getSupabase());
}
