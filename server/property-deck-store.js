import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_VIEW_MODES = new Set(['deck', 'table']);
const VALID_INSPECTOR_TABS = new Set(['core', 'financing', 'expenses', 'advanced']);
const VALID_FINANCING_FILTERS = new Set(['all', 'seller', 'conventional']);

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
    viewMode: row.view_mode,
    focusedIndex: Number(row.focused_index),
    inspectorTab: row.inspector_tab,
    financingFilter: row.financing_filter,
    searchQuery: row.search_query ?? '',
    mobileHintDismissed: Boolean(row.mobile_hint_dismissed),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.viewMode !== undefined && !VALID_VIEW_MODES.has(body.viewMode)) {
    errors.push('viewMode must be deck or table');
  }

  if (body.focusedIndex !== undefined) {
    const idx = Number(body.focusedIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 1000) {
      errors.push('focusedIndex must be an integer between 0 and 999');
    }
  }

  if (body.inspectorTab !== undefined && !VALID_INSPECTOR_TABS.has(body.inspectorTab)) {
    errors.push('inspectorTab must be core, financing, expenses, or advanced');
  }

  if (
    body.financingFilter !== undefined &&
    !VALID_FINANCING_FILTERS.has(body.financingFilter)
  ) {
    errors.push('financingFilter must be all, seller, or conventional');
  }

  if (body.searchQuery !== undefined) {
    if (typeof body.searchQuery !== 'string' || body.searchQuery.length > 200) {
      errors.push('searchQuery must be a string up to 200 characters');
    }
  }

  if (body.mobileHintDismissed !== undefined && typeof body.mobileHintDismissed !== 'boolean') {
    errors.push('mobileHintDismissed must be a boolean');
  }

  return errors;
}

export async function getPropertyDeckPreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('property_deck_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      viewMode: 'deck',
      focusedIndex: 0,
      inspectorTab: 'core',
      financingFilter: 'all',
      searchQuery: '',
      mobileHintDismissed: false,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertPropertyDeckPreferences(userId, body) {
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

  if (body.viewMode !== undefined) row.view_mode = body.viewMode;
  if (body.focusedIndex !== undefined) row.focused_index = body.focusedIndex;
  if (body.inspectorTab !== undefined) row.inspector_tab = body.inspectorTab;
  if (body.financingFilter !== undefined) row.financing_filter = body.financingFilter;
  if (body.searchQuery !== undefined) row.search_query = body.searchQuery;
  if (body.mobileHintDismissed !== undefined) row.mobile_hint_dismissed = body.mobileHintDismissed;

  const { data, error } = await client
    .from('property_deck_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isPropertyDeckEnabled() {
  return Boolean(getSupabase());
}
