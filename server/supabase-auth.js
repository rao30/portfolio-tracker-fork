import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { extractPortfolioToken, getPortfolioApiKey } from './auth.js';

let authClient = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim() || null;
}

function getSupabaseAuthKey() {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ??
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    null
  );
}

export function isSupabaseAuthEnabled() {
  return Boolean(getSupabaseUrl() && getSupabaseAuthKey());
}

function getAuthClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAuthKey();
  if (!url || !key) return null;
  if (!authClient) {
    authClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return authClient;
}

/** Verify Supabase JWT from Authorization header; returns user or null. */
export async function getSupabaseUserFromRequest(req) {
  const token = extractPortfolioToken(req);
  if (!token) return null;

  const apiKey = getPortfolioApiKey();
  if (apiKey && token === apiKey) return null;

  const client = getAuthClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
