import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const ANALYSIS_MODES = ['hold', 'sell', 'exchange', 'all'];
const SELL_MONTH_MIN = 1;
const SELL_MONTH_MAX = 360;
const CLOSING_COST_MIN = 0;
const CLOSING_COST_MAX = 0.15;
const CAP_GAINS_MIN = 0;
const CAP_GAINS_MAX = 0.4;
const RECAPTURE_MIN = 0;
const RECAPTURE_MAX = 0.35;
const HORIZON_MIN = 12;
const HORIZON_MAX = 360;
const PROCEEDS_MIN = 0;
const PROCEEDS_MAX = 1;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rowToPreferences(row) {
  return {
    isCollapsed: Boolean(row.is_collapsed),
    pinnedProperty: row.pinned_property ?? null,
    analysisMode: row.analysis_mode ?? 'all',
    sellAtMonth: Number(row.sell_at_month ?? 12),
    closingCostPct: Number(row.closing_cost_pct ?? 0.06),
    capitalGainsRate: Number(row.capital_gains_rate ?? 0.15),
    recaptureRate: Number(row.recapture_rate ?? 0.25),
    holdHorizonMonths: Number(row.hold_horizon_months ?? 120),
    proceedsToDebtPct: Number(row.proceeds_to_debt_pct ?? 1),
    showTaxBreakdown: Boolean(row.show_tax_breakdown ?? true),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.showTaxBreakdown !== undefined && typeof body.showTaxBreakdown !== 'boolean') {
    errors.push('showTaxBreakdown must be a boolean');
  }

  if (body.pinnedProperty !== undefined && body.pinnedProperty !== null) {
    if (typeof body.pinnedProperty !== 'string' || body.pinnedProperty.trim().length === 0) {
      errors.push('pinnedProperty must be a non-empty string or null');
    }
  }

  if (body.analysisMode !== undefined && !ANALYSIS_MODES.includes(body.analysisMode)) {
    errors.push('analysisMode must be hold, sell, exchange, or all');
  }

  if (body.sellAtMonth !== undefined) {
    const month = Number(body.sellAtMonth);
    if (!Number.isFinite(month) || month < SELL_MONTH_MIN || month > SELL_MONTH_MAX) {
      errors.push(`sellAtMonth must be between ${SELL_MONTH_MIN} and ${SELL_MONTH_MAX}`);
    }
  }

  if (body.closingCostPct !== undefined) {
    const pct = Number(body.closingCostPct);
    if (!Number.isFinite(pct) || pct < CLOSING_COST_MIN || pct > CLOSING_COST_MAX) {
      errors.push(`closingCostPct must be between ${CLOSING_COST_MIN} and ${CLOSING_COST_MAX}`);
    }
  }

  if (body.capitalGainsRate !== undefined) {
    const rate = Number(body.capitalGainsRate);
    if (!Number.isFinite(rate) || rate < CAP_GAINS_MIN || rate > CAP_GAINS_MAX) {
      errors.push(`capitalGainsRate must be between ${CAP_GAINS_MIN} and ${CAP_GAINS_MAX}`);
    }
  }

  if (body.recaptureRate !== undefined) {
    const rate = Number(body.recaptureRate);
    if (!Number.isFinite(rate) || rate < RECAPTURE_MIN || rate > RECAPTURE_MAX) {
      errors.push(`recaptureRate must be between ${RECAPTURE_MIN} and ${RECAPTURE_MAX}`);
    }
  }

  if (body.holdHorizonMonths !== undefined) {
    const months = Number(body.holdHorizonMonths);
    if (!Number.isFinite(months) || months < HORIZON_MIN || months > HORIZON_MAX) {
      errors.push(`holdHorizonMonths must be between ${HORIZON_MIN} and ${HORIZON_MAX}`);
    }
  }

  if (body.proceedsToDebtPct !== undefined) {
    const pct = Number(body.proceedsToDebtPct);
    if (!Number.isFinite(pct) || pct < PROCEEDS_MIN || pct > PROCEEDS_MAX) {
      errors.push(`proceedsToDebtPct must be between ${PROCEEDS_MIN} and ${PROCEEDS_MAX}`);
    }
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
      proceedsToDebtPct: 1,
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
  if (body.showTaxBreakdown !== undefined) row.show_tax_breakdown = body.showTaxBreakdown;
  if (body.pinnedProperty !== undefined) {
    row.pinned_property = body.pinnedProperty;
  }
  if (body.analysisMode !== undefined) row.analysis_mode = body.analysisMode;
  if (body.sellAtMonth !== undefined) {
    row.sell_at_month = Math.round(
      clamp(Number(body.sellAtMonth), SELL_MONTH_MIN, SELL_MONTH_MAX),
    );
  }
  if (body.closingCostPct !== undefined) {
    row.closing_cost_pct = clamp(Number(body.closingCostPct), CLOSING_COST_MIN, CLOSING_COST_MAX);
  }
  if (body.capitalGainsRate !== undefined) {
    row.capital_gains_rate = clamp(Number(body.capitalGainsRate), CAP_GAINS_MIN, CAP_GAINS_MAX);
  }
  if (body.recaptureRate !== undefined) {
    row.recapture_rate = clamp(Number(body.recaptureRate), RECAPTURE_MIN, RECAPTURE_MAX);
  }
  if (body.holdHorizonMonths !== undefined) {
    row.hold_horizon_months = Math.round(
      clamp(Number(body.holdHorizonMonths), HORIZON_MIN, HORIZON_MAX),
    );
  }
  if (body.proceedsToDebtPct !== undefined) {
    row.proceeds_to_debt_pct = clamp(Number(body.proceedsToDebtPct), PROCEEDS_MIN, PROCEEDS_MAX);
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
