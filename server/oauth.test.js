import { createHash, randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { isPortfolioApiAuthorized } from './auth.js';
import { resetOAuthStore } from './oauth-store.js';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  createAuthorizationRedirect,
  dynamicClientRegister,
  exchangeAuthorizationCode,
  isAllowedRedirectUri,
  isValidOAuthAccessToken,
  refreshAccessToken,
  verifyPkce,
} from './oauth.js';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('OAuth for MCP', () => {
  const baseUrl = 'https://portfolio.example.com';

  afterEach(() => {
    delete process.env.PORTFOLIO_API_KEY;
    resetOAuthStore();
  });

  it('exposes RFC 9728 and RFC 8414 metadata', () => {
    process.env.PORTFOLIO_API_KEY = 'test-key';
    expect(buildProtectedResourceMetadata(baseUrl)).toMatchObject({
      resource: 'https://portfolio.example.com/mcp',
      authorization_servers: ['https://portfolio.example.com'],
      scopes_supported: ['mcp:tools'],
    });
    expect(buildAuthorizationServerMetadata(baseUrl)).toMatchObject({
      issuer: 'https://portfolio.example.com',
      authorization_endpoint:
        'https://portfolio.example.com/oauth/authorize',
      token_endpoint: 'https://portfolio.example.com/oauth/token',
      registration_endpoint:
        'https://portfolio.example.com/oauth/register',
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('registers clients and completes authorization code + PKCE flow', () => {
    process.env.PORTFOLIO_API_KEY = 'test-key';
    const redirectUri = 'https://chatgpt.com/oauth/callback';
    const reg = dynamicClientRegister({
      client_name: 'ChatGPT',
      redirect_uris: [redirectUri],
    });
    expect(reg.client_id).toBeTruthy();

    const { verifier, challenge } = pkcePair();
    const auth = createAuthorizationRedirect({
      clientId: reg.client_id,
      redirectUri,
      state: 'state-123',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      portfolioKey: 'test-key',
    });
    expect(auth.redirect).toContain(redirectUri);
    const code = new URL(auth.redirect).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokens = exchangeAuthorizationCode({
      grant_type: 'authorization_code',
      code,
      client_id: reg.client_id,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(isValidOAuthAccessToken(tokens.access_token)).toBe(true);
    expect(
      isPortfolioApiAuthorized({
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    ).toBe(true);

    const refreshed = refreshAccessToken({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: reg.client_id,
    });
    expect(refreshed.access_token).toBeTruthy();
    expect(refreshed.access_token).not.toBe(tokens.access_token);
  });

  it('rejects invalid portfolio key at authorize', () => {
    process.env.PORTFOLIO_API_KEY = 'test-key';
    const reg = dynamicClientRegister({
      redirect_uris: ['https://localhost/callback'],
    });
    const { challenge } = pkcePair();
    const result = createAuthorizationRedirect({
      clientId: reg.client_id,
      redirectUri: 'https://localhost/callback',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      portfolioKey: 'wrong',
    });
    expect(result.error).toBe('access_denied');
  });

  it('validates redirect URIs and PKCE', () => {
    expect(isAllowedRedirectUri('http://localhost:3000/cb')).toBe(true);
    expect(isAllowedRedirectUri('https://chatgpt.com/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://evil.com/cb')).toBe(false);

    const { verifier, challenge } = pkcePair();
    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true);
    expect(verifyPkce(verifier, 'bad', 'S256')).toBe(false);
  });
});
