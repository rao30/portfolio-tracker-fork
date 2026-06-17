import { createClient, type Session } from '@supabase/supabase-js';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let client: ReturnType<typeof createClient> | null = null;
let resolvedConfig: SupabaseConfig | null = null;
let configPromise: Promise<SupabaseConfig | null> | null = null;

function configFromViteEnv(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

async function resolveConfig(): Promise<SupabaseConfig | null> {
  const fromVite = configFromViteEnv();
  if (fromVite) return fromVite;

  try {
    const res = await fetch('/api/client-config');
    if (!res.ok) return null;
    const data = (await res.json()) as {
      supabaseUrl?: string | null;
      supabaseAnonKey?: string | null;
    };
    if (data.supabaseUrl && data.supabaseAnonKey) {
      return { url: data.supabaseUrl, anonKey: data.supabaseAnonKey };
    }
  } catch {
    return null;
  }
  return null;
}

export async function initSupabaseConfig(): Promise<boolean> {
  if (resolvedConfig) return true;
  if (!configPromise) configPromise = resolveConfig();
  resolvedConfig = await configPromise;
  return Boolean(resolvedConfig);
}

export function isSupabaseClientConfigured() {
  return Boolean(resolvedConfig ?? configFromViteEnv());
}

export async function getSupabase() {
  if (!resolvedConfig) {
    const ready = await initSupabaseConfig();
    if (!ready || !resolvedConfig) {
      throw new Error('Supabase is not configured');
    }
  }
  if (!client) {
    client = createClient(resolvedConfig.url, resolvedConfig.anonKey);
  }
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  if (!(await initSupabaseConfig())) return null;
  const { data } = await (await getSupabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

export type { Session };
