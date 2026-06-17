import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: ReturnType<typeof createClient> | null = null;

export function isSupabaseClientConfigured() {
  return Boolean(url && anonKey);
}

export function getSupabase() {
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  }
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseClientConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export type { Session };
