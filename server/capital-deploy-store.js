import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const LANES = ['paydown', 'reserve', 'acquisition'];
const TARGET_RESERVE_MIN = 1;
const TARGET_RESERVE_MAX = 24;
const COC_HURDLE_MIN = 0;
const COC_HURDLE_MAX = 0.5;
const DEPLOY_STEP_MIN = 50;
const DEPLOY_STEP_MAX = 5000;
const DEPLOY_AMOUNT_MAX = 1_000_000;

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
    targetReserveMonths: Number(row.target_reserve_months ?? 6),
    acquisitionCocHurdle: Number(row.acquisition_coc_hurdle ?? 0.08),
    lastExploredDeployAmount:
      row.last_explored_deploy_amount != null
        ? Number(row.last_explored_deploy_amount)
        : null,
    pinnedLane: row.pinned_lane ?? null,
    deployStep: Number(row.deploy_step ?? 100),
    showLaneComparison: Boolean(row.show_lane_comparison ?? true),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.showLaneComparison !== undefined && typeof body.showLaneComparison !== 'boolean') {
    errors.push('showLaneComparison must be a boolean');
  }

  if (body.targetReserveMonths !== undefined) {
    const months = Number(body.targetReserveMonths);
    if (
      !Number.isFinite(months) ||
      months < TARGET_RESERVE_MIN ||
      months > TARGET_RESERVE_MAX
    ) {
      errors.push(`targetReserveMonths must be between ${TARGET_RESERVE_MIN} and ${TARGET_RESERVE_MAX}`);
    }
  }

  if (body.acquisitionCocHurdle !== undefined) {
    const hurdle = Number(body.acquisitionCocHurdle);
    if (!Number.isFinite(hurdle) || hurdle < COC_HURDLE_MIN || hurdle > COC_HURDLE_MAX) {
      errors.push(`acquisitionCocHurdle must be between ${COC_HURDLE_MIN} and ${COC_HURDLE_MAX}`);
    }
  }

  if (body.deployStep !== undefined) {
    const step = Number(body.deployStep);
    if (!Number.isFinite(step) || step < DEPLOY_STEP_MIN || step > DEPLOY_STEP_MAX) {
      errors.push(`deployStep must be between ${DEPLOY_STEP_MIN} and ${DEPLOY_STEP_MAX}`);
    }
  }

  if (body.lastExploredDeployAmount !== undefined && body.lastExploredDeployAmount !== null) {
    const amount = Number(body.lastExploredDeployAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > DEPLOY_AMOUNT_MAX) {
      errors.push(`lastExploredDeployAmount must be between 0 and ${DEPLOY_AMOUNT_MAX}`);
    }
  }

  if (body.pinnedLane !== undefined && body.pinnedLane !== null) {
    if (!LANES.includes(body.pinnedLane)) {
      errors.push('pinnedLane must be paydown, reserve, or acquisition');
    }
  }

  return errors;
}

export async function getCapitalDeployPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('capital_deploy_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      targetReserveMonths: 6,
      acquisitionCocHurdle: 0.08,
      lastExploredDeployAmount: null,
      pinnedLane: null,
      deployStep: 100,
      showLaneComparison: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertCapitalDeployPreferences(userId, body) {
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
  if (body.showLaneComparison !== undefined) row.show_lane_comparison = body.showLaneComparison;
  if (body.targetReserveMonths !== undefined) {
    row.target_reserve_months = Math.round(
      clamp(Number(body.targetReserveMonths), TARGET_RESERVE_MIN, TARGET_RESERVE_MAX),
    );
  }
  if (body.acquisitionCocHurdle !== undefined) {
    row.acquisition_coc_hurdle = clamp(
      Number(body.acquisitionCocHurdle),
      COC_HURDLE_MIN,
      COC_HURDLE_MAX,
    );
  }
  if (body.deployStep !== undefined) {
    row.deploy_step = clamp(Number(body.deployStep), DEPLOY_STEP_MIN, DEPLOY_STEP_MAX);
  }
  if (body.lastExploredDeployAmount !== undefined) {
    row.last_explored_deploy_amount = body.lastExploredDeployAmount;
  }
  if (body.pinnedLane !== undefined) {
    row.pinned_lane = body.pinnedLane;
  }

  const { data, error } = await client
    .from('capital_deploy_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isCapitalDeployEnabled() {
  return Boolean(getSupabase());
}
