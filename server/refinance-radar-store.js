import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const ANALYSIS_MODES = ['rate_term', 'cash_out', 'both'];
const MARKET_RATE_MIN = 0.01;
const MARKET_RATE_MAX = 0.2;
const CLOSING_COST_MIN = 0;
const CLOSING_COST_MAX = 0.1;
const HOLD_PERIOD_MIN = 12;
const HOLD_PERIOD_MAX = 360;
const CASH_OUT_LTV_MIN = 0.5;
const CASH_OUT_LTV_MAX = 0.85;
const MIN_DSCR_MIN = 0.5;
const MIN_DSCR_MAX = 2.0;
const DEPLOYMENT_YIELD_MIN = 0;
const DEPLOYMENT_YIELD_MAX = 0.5;
const REFI_TERM_MIN = 60;
const REFI_TERM_MAX = 480;

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

  if (body.analysisMode !== undefined && !ANALYSIS_MODES.includes(body.analysisMode)) {
    errors.push('analysisMode must be rate_term, cash_out, or both');
  }

  if (body.pinnedProperty !== undefined && body.pinnedProperty !== null) {
    if (typeof body.pinnedProperty !== 'string' || body.pinnedProperty.trim().length === 0) {
      errors.push('pinnedProperty must be a non-empty string or null');
    }
  }

  if (body.marketRate !== undefined) {
    const v = Number(body.marketRate);
    if (!Number.isFinite(v) || v < MARKET_RATE_MIN || v > MARKET_RATE_MAX) {
      errors.push(`marketRate must be between ${MARKET_RATE_MIN} and ${MARKET_RATE_MAX}`);
    }
  }

  if (body.closingCostPct !== undefined) {
    const v = Number(body.closingCostPct);
    if (!Number.isFinite(v) || v < CLOSING_COST_MIN || v > CLOSING_COST_MAX) {
      errors.push(`closingCostPct must be between ${CLOSING_COST_MIN} and ${CLOSING_COST_MAX}`);
    }
  }

  if (body.holdPeriodMonths !== undefined) {
    const v = Number(body.holdPeriodMonths);
    if (!Number.isFinite(v) || v < HOLD_PERIOD_MIN || v > HOLD_PERIOD_MAX) {
      errors.push(`holdPeriodMonths must be between ${HOLD_PERIOD_MIN} and ${HOLD_PERIOD_MAX}`);
    }
  }

  if (body.cashOutLtv !== undefined) {
    const v = Number(body.cashOutLtv);
    if (!Number.isFinite(v) || v < CASH_OUT_LTV_MIN || v > CASH_OUT_LTV_MAX) {
      errors.push(`cashOutLtv must be between ${CASH_OUT_LTV_MIN} and ${CASH_OUT_LTV_MAX}`);
    }
  }

  if (body.minDscr !== undefined) {
    const v = Number(body.minDscr);
    if (!Number.isFinite(v) || v < MIN_DSCR_MIN || v > MIN_DSCR_MAX) {
      errors.push(`minDscr must be between ${MIN_DSCR_MIN} and ${MIN_DSCR_MAX}`);
    }
  }

  if (body.deploymentYield !== undefined) {
    const v = Number(body.deploymentYield);
    if (!Number.isFinite(v) || v < DEPLOYMENT_YIELD_MIN || v > DEPLOYMENT_YIELD_MAX) {
      errors.push(
        `deploymentYield must be between ${DEPLOYMENT_YIELD_MIN} and ${DEPLOYMENT_YIELD_MAX}`,
      );
    }
  }

  if (body.refiTermMonths !== undefined) {
    const v = Number(body.refiTermMonths);
    if (!Number.isFinite(v) || v < REFI_TERM_MIN || v > REFI_TERM_MAX) {
      errors.push(`refiTermMonths must be between ${REFI_TERM_MIN} and ${REFI_TERM_MAX}`);
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
      minDscr: 1.25,
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
  if (body.marketRate !== undefined) {
    row.market_rate = clamp(Number(body.marketRate), MARKET_RATE_MIN, MARKET_RATE_MAX);
  }
  if (body.closingCostPct !== undefined) {
    row.closing_cost_pct = clamp(Number(body.closingCostPct), CLOSING_COST_MIN, CLOSING_COST_MAX);
  }
  if (body.holdPeriodMonths !== undefined) {
    row.hold_period_months = Math.round(
      clamp(Number(body.holdPeriodMonths), HOLD_PERIOD_MIN, HOLD_PERIOD_MAX),
    );
  }
  if (body.cashOutLtv !== undefined) {
    row.cash_out_ltv = clamp(Number(body.cashOutLtv), CASH_OUT_LTV_MIN, CASH_OUT_LTV_MAX);
  }
  if (body.minDscr !== undefined) {
    row.min_dscr = clamp(Number(body.minDscr), MIN_DSCR_MIN, MIN_DSCR_MAX);
  }
  if (body.deploymentYield !== undefined) {
    row.deployment_yield = clamp(
      Number(body.deploymentYield),
      DEPLOYMENT_YIELD_MIN,
      DEPLOYMENT_YIELD_MAX,
    );
  }
  if (body.refiTermMonths !== undefined) {
    row.refi_term_months = Math.round(
      clamp(Number(body.refiTermMonths), REFI_TERM_MIN, REFI_TERM_MAX),
    );
  }

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
