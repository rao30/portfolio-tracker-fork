import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const VALID_TEMPLATES = new Set(['clone_last', 'acquisition', 'blank']);
const VALID_FINANCING = new Set(['conventional', 'seller']);
const VALID_STEPS = new Set([
  'template',
  'identity',
  'loan',
  'income',
  'review',
]);

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
    preferredTemplate: row.preferred_template,
    defaultFinancingType: row.default_financing_type,
    lastCompletedStep: row.last_completed_step,
    autoCalculatePayment: Boolean(row.auto_calculate_payment),
    updatedAt: row.updated_at,
  };
}

function validatePayload(body) {
  const errors = [];

  if (body.isCollapsed !== undefined && typeof body.isCollapsed !== 'boolean') {
    errors.push('isCollapsed must be a boolean');
  }

  if (
    body.preferredTemplate !== undefined &&
    !VALID_TEMPLATES.has(body.preferredTemplate)
  ) {
    errors.push('preferredTemplate must be clone_last, acquisition, or blank');
  }

  if (
    body.defaultFinancingType !== undefined &&
    !VALID_FINANCING.has(body.defaultFinancingType)
  ) {
    errors.push('defaultFinancingType must be conventional or seller');
  }

  if (body.lastCompletedStep !== undefined && !VALID_STEPS.has(body.lastCompletedStep)) {
    errors.push('lastCompletedStep must be a valid intake step');
  }

  if (
    body.autoCalculatePayment !== undefined &&
    typeof body.autoCalculatePayment !== 'boolean'
  ) {
    errors.push('autoCalculatePayment must be a boolean');
  }

  return errors;
}

export async function getPropertyIntakePreferences(userId) {
  const client = getSupabase();
  if (!client) {
    throw new Error('Cloud storage is not configured');
  }

  const { data, error } = await client
    .from('property_intake_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      isCollapsed: false,
      preferredTemplate: 'clone_last',
      defaultFinancingType: 'conventional',
      lastCompletedStep: 'template',
      autoCalculatePayment: true,
      updatedAt: null,
    };
  }

  return rowToPreferences(data);
}

export async function upsertPropertyIntakePreferences(userId, body) {
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
  if (body.preferredTemplate !== undefined) row.preferred_template = body.preferredTemplate;
  if (body.defaultFinancingType !== undefined) {
    row.default_financing_type = body.defaultFinancingType;
  }
  if (body.lastCompletedStep !== undefined) row.last_completed_step = body.lastCompletedStep;
  if (body.autoCalculatePayment !== undefined) {
    row.auto_calculate_payment = body.autoCalculatePayment;
  }

  const { data, error } = await client
    .from('property_intake_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return rowToPreferences(data);
}

export function isPropertyIntakeEnabled() {
  return Boolean(getSupabase());
}
