import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const CUSTOM_VACANCY_MIN = 0;
const CUSTOM_VACANCY_MAX = 0.5;
const CUSTOM_CAPEX_MIN = 0;
const CUSTOM_CAPEX_MAX = 0.5;
const CUSTOM_RATE_SHOCK_MIN = 0;
const CUSTOM_RATE_SHOCK_MAX = 0.1;
const CUSTOM_PAUSE_MIN = 0;
const CUSTOM_PAUSE_MAX = 120;

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
    lastExploredScenarioId: row.last_explored_scenario_id ?? null,
    pinnedPresetId: row.pinned_preset_id ?? null,
    showSellScenarios: Boolean(row.show_sell_scenarios),
    customKnobs: {
      vacancy: Number(row.custom_vacancy ?? 0.05),
      capex: Number(row.custom_capex ?? 0.1),
      rateShock: Number(row.custom_rate_shock ?? 0),
      pauseMonths: Number(row.custom_pause_months ?? 0),
    },
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (body.showSellScenarios !== undefined && typeof body.showSellScenarios !== 'boolean') {
    errors.push('showSellScenarios must be a boolean');
  }

  if (body.lastExploredScenarioId !== undefined && body.lastExploredScenarioId !== null) {
    if (
      typeof body.lastExploredScenarioId !== 'string' ||
      body.lastExploredScenarioId.trim().length === 0
    ) {
      errors.push('lastExploredScenarioId must be a non-empty string or null');
    }
  }

  if (body.pinnedPresetId !== undefined && body.pinnedPresetId !== null) {
    if (typeof body.pinnedPresetId !== 'string' || body.pinnedPresetId.trim().length === 0) {
      errors.push('pinnedPresetId must be a non-empty string or null');
    }
  }

  if (body.customKnobs !== undefined) {
    if (typeof body.customKnobs !== 'object' || body.customKnobs === null) {
      errors.push('customKnobs must be an object');
    } else {
      const { vacancy, capex, rateShock, pauseMonths } = body.customKnobs;
      if (vacancy !== undefined) {
        const v = Number(vacancy);
        if (!Number.isFinite(v) || v < CUSTOM_VACANCY_MIN || v > CUSTOM_VACANCY_MAX) {
          errors.push(`customKnobs.vacancy must be between ${CUSTOM_VACANCY_MIN} and ${CUSTOM_VACANCY_MAX}`);
        }
      }
      if (capex !== undefined) {
        const c = Number(capex);
        if (!Number.isFinite(c) || c < CUSTOM_CAPEX_MIN || c > CUSTOM_CAPEX_MAX) {
          errors.push(`customKnobs.capex must be between ${CUSTOM_CAPEX_MIN} and ${CUSTOM_CAPEX_MAX}`);
        }
      }
      if (rateShock !== undefined) {
        const r = Number(rateShock);
        if (!Number.isFinite(r) || r < CUSTOM_RATE_SHOCK_MIN || r > CUSTOM_RATE_SHOCK_MAX) {
          errors.push(`customKnobs.rateShock must be between ${CUSTOM_RATE_SHOCK_MIN} and ${CUSTOM_RATE_SHOCK_MAX}`);
        }
      }
      if (pauseMonths !== undefined) {
        const p = Number(pauseMonths);
        if (!Number.isFinite(p) || p < CUSTOM_PAUSE_MIN || p > CUSTOM_PAUSE_MAX) {
          errors.push(`customKnobs.pauseMonths must be between ${CUSTOM_PAUSE_MIN} and ${CUSTOM_PAUSE_MAX}`);
        }
      }
    }
  }

  return errors;
}

function sanitizeCustomKnobs(knobs) {
  return {
    vacancy: clamp(Number(knobs?.vacancy ?? 0.05), CUSTOM_VACANCY_MIN, CUSTOM_VACANCY_MAX),
    capex: clamp(Number(knobs?.capex ?? 0.1), CUSTOM_CAPEX_MIN, CUSTOM_CAPEX_MAX),
    rateShock: clamp(Number(knobs?.rateShock ?? 0), CUSTOM_RATE_SHOCK_MIN, CUSTOM_RATE_SHOCK_MAX),
    pauseMonths: Math.round(
      clamp(Number(knobs?.pauseMonths ?? 0), CUSTOM_PAUSE_MIN, CUSTOM_PAUSE_MAX),
    ),
  };
}

export async function getStressLabPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('stress_lab_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      lastExploredScenarioId: null,
      pinnedPresetId: null,
      showSellScenarios: false,
      customKnobs: {
        vacancy: 0.05,
        capex: 0.1,
        rateShock: 0,
        pauseMonths: 0,
      },
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertStressLabPreferences(userId, body) {
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
  if (body.showSellScenarios !== undefined) row.show_sell_scenarios = body.showSellScenarios;
  if (body.lastExploredScenarioId !== undefined) {
    row.last_explored_scenario_id = body.lastExploredScenarioId;
  }
  if (body.pinnedPresetId !== undefined) {
    row.pinned_preset_id = body.pinnedPresetId;
  }
  if (body.customKnobs !== undefined) {
    const knobs = sanitizeCustomKnobs(body.customKnobs);
    row.custom_vacancy = knobs.vacancy;
    row.custom_capex = knobs.capex;
    row.custom_rate_shock = knobs.rateShock;
    row.custom_pause_months = knobs.pauseMonths;
  }

  const { data, error } = await client
    .from('stress_lab_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isStressLabEnabled() {
  return Boolean(getSupabase());
}
