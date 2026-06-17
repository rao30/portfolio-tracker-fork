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

export function isTimelineScenariosEnabled() {
  return Boolean(getSupabase());
}

const VALID_EVENT_TYPES = new Set([
  'rentChange',
  'rateReset',
  'capexSpike',
  'refinance',
  'acquisition',
  'disposition',
]);

function sanitizePropertyEvents(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('propertyEvents must be an array');
  }

  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Each propertyEvents entry must be an object');
    }
    const propertyName =
      typeof entry.propertyName === 'string' ? entry.propertyName.trim() : '';
    if (!propertyName) {
      throw new Error('propertyName is required for each overlay');
    }

    const events = Array.isArray(entry.events) ? entry.events : [];
    const sanitizedEvents = events.map((ev) => {
      if (!ev || typeof ev !== 'object') {
        throw new Error('Each event must be an object');
      }
      const type = ev.type;
      if (!VALID_EVENT_TYPES.has(type)) {
        throw new Error(`Invalid event type: ${type}`);
      }
      const month = Number(ev.month);
      if (!Number.isInteger(month) || month < 1 || month > 600) {
        throw new Error(`Event month must be 1–600 (got ${ev.month})`);
      }
      return ev;
    });

    return { propertyName, events: sanitizedEvents };
  });
}

function rowToRecord(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    propertyEvents: row.property_events ?? [],
    scenarioConfig: row.scenario_config,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTimelineScenarios(userId) {
  const client = getSupabase();
  if (!client) return [];
  if (!userId) throw new Error('User id required');

  const { data, error } = await client
    .from('portfolio_timeline_scenarios')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list timeline scenarios: ${error.message}`);
  return (data ?? []).map(rowToRecord);
}

export async function createTimelineScenario(userId, payload) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');
  if (!userId) throw new Error('User id required');

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) throw new Error('Name is required');

  const propertyEvents = sanitizePropertyEvents(payload.propertyEvents ?? []);
  const color =
    typeof payload.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(payload.color)
      ? payload.color
      : '#06b6d4';

  const { data, error } = await client
    .from('portfolio_timeline_scenarios')
    .insert({
      user_id: userId,
      name,
      description: payload.description ?? null,
      property_events: propertyEvents,
      scenario_config: payload.scenarioConfig ?? null,
      color,
      sort_order: Number(payload.sortOrder) || 0,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A scenario with this name already exists');
    }
    throw new Error(`Failed to create timeline scenario: ${error.message}`);
  }

  return rowToRecord(data);
}

export async function deleteTimelineScenario(userId, scenarioId) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');
  if (!userId) throw new Error('User id required');

  const { error, count } = await client
    .from('portfolio_timeline_scenarios')
    .delete({ count: 'exact' })
    .eq('id', scenarioId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to delete timeline scenario: ${error.message}`);
  if (count === 0) throw new Error('Scenario not found');
  return { ok: true };
}
