import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const ACTIVE_STATUSES = ['claimed', 'in_progress'];
const ALL_STATUSES = ['claimed', 'in_progress', 'completed', 'abandoned'];
const DEFAULT_CLAIM_HOURS = 48;
const MAX_CLAIM_HOURS = 168;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function rowToClaim(row) {
  return {
    id: row.id,
    featureSlug: row.feature_slug,
    featureTitle: row.feature_title,
    agentSessionId: row.agent_session_id,
    status: row.status,
    branchName: row.branch_name ?? null,
    prUrl: row.pr_url ?? null,
    rationale: row.rationale ?? null,
    claimedAt: row.claimed_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at,
  };
}

function validateSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug.trim())) {
    return 'featureSlug must be lowercase kebab-case (e.g. refinance-radar)';
  }
  return null;
}

async function expireStaleClaims(client) {
  const now = new Date().toISOString();
  await client
    .from('agent_feature_registry')
    .update({ status: 'abandoned', updated_at: now })
    .in('status', ACTIVE_STATUSES)
    .lt('expires_at', now);
}

export async function listAgentFeatureClaims({ includeCompleted = false } = {}) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  await expireStaleClaims(client);

  let query = client
    .from('agent_feature_registry')
    .select('*')
    .order('claimed_at', { ascending: false });

  if (!includeCompleted) {
    query = query.in('status', ACTIVE_STATUSES);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToClaim);
}

export async function claimAgentFeature(body) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const slugError = validateSlug(body?.featureSlug);
  if (slugError) {
    const err = new Error(slugError);
    err.status = 400;
    throw err;
  }

  if (
    typeof body?.featureTitle !== 'string' ||
    body.featureTitle.trim().length === 0
  ) {
    const err = new Error('featureTitle is required');
    err.status = 400;
    throw err;
  }

  if (
    typeof body?.agentSessionId !== 'string' ||
    body.agentSessionId.trim().length === 0
  ) {
    const err = new Error('agentSessionId is required');
    err.status = 400;
    throw err;
  }

  await expireStaleClaims(client);

  const claimHours = Math.min(
    MAX_CLAIM_HOURS,
    Math.max(1, Number(body.claimHours ?? DEFAULT_CLAIM_HOURS)),
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + claimHours * 60 * 60 * 1000);

  const row = {
    feature_slug: body.featureSlug.trim(),
    feature_title: body.featureTitle.trim(),
    agent_session_id: body.agentSessionId.trim(),
    status: 'claimed',
    branch_name: body.branchName?.trim() || null,
    rationale: body.rationale?.trim()?.slice(0, 2000) || null,
    claimed_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data, error } = await client
    .from('agent_feature_registry')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: active } = await client
        .from('agent_feature_registry')
        .select('*')
        .eq('feature_slug', row.feature_slug)
        .in('status', ACTIVE_STATUSES)
        .maybeSingle();
      const err = new Error(
        active
          ? `Feature "${row.feature_slug}" is already claimed by agent ${active.agent_session_id}`
          : `Feature "${row.feature_slug}" is already claimed`,
      );
      err.status = 409;
      err.existingClaim = active ? rowToClaim(active) : undefined;
      throw err;
    }
    throw error;
  }

  return rowToClaim(data);
}

export async function updateAgentFeatureClaim(featureSlug, body) {
  const client = getSupabase();
  if (!client) throw new Error('Cloud storage is not configured');

  const slugError = validateSlug(featureSlug);
  if (slugError) {
    const err = new Error(slugError);
    err.status = 400;
    throw err;
  }

  await expireStaleClaims(client);

  const updates = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (!ALL_STATUSES.includes(body.status)) {
      const err = new Error('status must be claimed, in_progress, completed, or abandoned');
      err.status = 400;
      throw err;
    }
    updates.status = body.status;
    if (body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
  }

  if (body.branchName !== undefined) updates.branch_name = body.branchName?.trim() || null;
  if (body.prUrl !== undefined) updates.pr_url = body.prUrl?.trim() || null;
  if (body.rationale !== undefined) {
    updates.rationale = body.rationale?.trim()?.slice(0, 2000) || null;
  }
  if (body.extendHours !== undefined) {
    const hours = Math.min(MAX_CLAIM_HOURS, Math.max(1, Number(body.extendHours)));
    updates.expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  const { data, error } = await client
    .from('agent_feature_registry')
    .update(updates)
    .eq('feature_slug', featureSlug.trim())
    .in('status', ACTIVE_STATUSES)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error(`No active claim found for feature "${featureSlug}"`);
    err.status = 404;
    throw err;
  }

  return rowToClaim(data);
}

export async function releaseAgentFeatureClaim(featureSlug, agentSessionId) {
  return updateAgentFeatureClaim(featureSlug, {
    status: 'abandoned',
    rationale: agentSessionId ? `Released by ${agentSessionId}` : undefined,
  });
}

export function isAgentFeatureRegistryEnabled() {
  return Boolean(getSupabase());
}
