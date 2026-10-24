import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClientConfig } from './client-config.js';

afterEach(() => vi.unstubAllEnvs());

describe('public client configuration', () => {
  it('returns only public connection settings even when server and legacy browser keys exist', () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'public-test-key');
    vi.stubEnv('PORTFOLIO_API_KEY', 'server-secret-canary');
    vi.stubEnv('PORTFOLIO_WRITE_KEY', 'server-write-canary');
    vi.stubEnv('VITE_PORTFOLIO_API_KEY', 'browser-secret-canary');
    vi.stubEnv('VITE_PORTFOLIO_WRITE_KEY', 'browser-write-canary');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'database-secret-canary');
    expect(getSupabaseClientConfig()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-test-key',
    });
  });
});
