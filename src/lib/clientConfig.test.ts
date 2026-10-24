import { afterEach, expect, it, vi } from 'vitest';
import { getClientConfig } from './clientConfig';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('never loads shared credentials from build variables or an older public endpoint', async () => {
  vi.stubEnv('VITE_PORTFOLIO_API_KEY', 'build-secret-canary');
  vi.stubEnv('VITE_PORTFOLIO_WRITE_KEY', 'build-write-canary');
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ portfolioApiKey: 'old-server-secret-canary' }),
  });
  vi.stubGlobal('fetch', fetch);
  expect(await getClientConfig()).toEqual({});
  expect(fetch).not.toHaveBeenCalled();
});
