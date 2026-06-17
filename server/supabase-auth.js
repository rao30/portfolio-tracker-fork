import { createClient } from '@supabase/supabase-js';
import { extractPortfolioToken, getPortfolioApiKey } from './auth.js';

let anonClient = null;

export function isSupabaseAuthEnabled() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

function getAnonClient() {
  if (!isSupabaseAuthEnabled()) return null;
  if (!anonClient) {
    anonClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY ??
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        process.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return anonClient;
}

/** Verify Supabase JWT from Authorization header; returns user or null. */
export async function getSupabaseUserFromRequest(req) {
  const token = extractPortfolioToken(req);
  if (!token) return null;

  const apiKey = getPortfolioApiKey();
  if (apiKey && token === apiKey) return null;

  const client = getAnonClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
