import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getPortfolioApiKey } from './auth.js';
import {
  consumeAuthCode,
  consumeRefreshToken,
  getAccessToken,
  getClient,
  registerClient,
  saveAccessToken,
  saveAuthCode,
  saveRefreshToken,
} from './oauth-store.js';

export const OAUTH_SCOPE = 'mcp:tools';
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function getOAuthIssuer(baseUrl) {
  return baseUrl.replace(/\/$/, '');
}

export function getMcpResourceUrl(baseUrl) {
  return `${getOAuthIssuer(baseUrl)}/mcp`;
}

export function buildProtectedResourceMetadata(baseUrl) {
  const issuer = getOAuthIssuer(baseUrl);
  return {
    resource: getMcpResourceUrl(baseUrl),
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [OAUTH_SCOPE],
  };
}

export function buildAuthorizationServerMetadata(baseUrl) {
  const issuer = getOAuthIssuer(baseUrl);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [OAUTH_SCOPE],
  };
}

export function buildWwwAuthenticateHeader(baseUrl) {
  const resourceMetadata = `${getOAuthIssuer(baseUrl)}/.well-known/oauth-protected-resource`;
  return `Bearer realm="mcp", resource_metadata="${resourceMetadata}"`;
}

export function isOAuthEnabled() {
  return Boolean(getPortfolioApiKey());
}

function randomId(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function verifyPkce(codeVerifier, codeChallenge, method) {
  if (!codeVerifier || !codeChallenge) return false;
  if (method !== 'S256') return false;
  const digest = createHash('sha256').update(codeVerifier).digest('base64url');
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(codeChallenge);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAllowedRedirectUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }
  return parsed.protocol === 'https:';
}

function clientAllowsRedirect(client, redirectUri) {
  return client.redirectUris.some((u) => u === redirectUri);
}

export function dynamicClientRegister(body) {
  const redirectUris = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((u) => typeof u === 'string')
    : [];
  if (redirectUris.length === 0) {
    return { error: 'invalid_client_metadata', error_description: 'redirect_uris required' };
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      return {
        error: 'invalid_redirect_uri',
        error_description: `redirect_uri must be https or localhost: ${uri}`,
      };
    }
  }

  const clientId = randomId(16);
  const record = {
    clientId,
    redirectUris,
    clientName: typeof body?.client_name === 'string' ? body.client_name : undefined,
    createdAt: Date.now(),
  };
  registerClient(record);

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(record.createdAt / 1000),
    client_secret_expires_at: 0,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_name: record.clientName,
  };
}

export function validatePortfolioLogin(password) {
  const expected = getPortfolioApiKey();
  if (!expected || typeof password !== 'string') return false;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createAuthorizationRedirect(params) {
  const {
    clientId,
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
    portfolioKey,
  } = params;

  const client = getClient(clientId);
  if (!client) {
    return { error: 'invalid_client', error_description: 'Unknown client_id' };
  }
  if (!isAllowedRedirectUri(redirectUri) || !clientAllowsRedirect(client, redirectUri)) {
    return { error: 'invalid_redirect_uri' };
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return { error: 'invalid_request', error_description: 'PKCE S256 required' };
  }
  if (!validatePortfolioLogin(portfolioKey)) {
    return { error: 'access_denied', error_description: 'Invalid portfolio key' };
  }

  const code = randomId(24);
  saveAuthCode(code, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope: scope || OAUTH_SCOPE,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
  });

  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return { redirect: url.toString() };
}

function issueTokens(clientId, scope) {
  const accessToken = randomId(32);
  const refreshToken = randomId(32);
  const expiresAt = Date.now() + ACCESS_TOKEN_TTL_MS;

  saveAccessToken(accessToken, {
    clientId,
    scope,
    expiresAt,
  });
  saveRefreshToken(refreshToken, {
    clientId,
    scope,
    accessToken,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope,
  };
}

export function exchangeAuthorizationCode(body) {
  const code = body?.code;
  const clientId = body?.client_id;
  const redirectUri = body?.redirect_uri;
  const codeVerifier = body?.code_verifier;

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return { error: 'invalid_request', error_description: 'Missing code exchange fields' };
  }

  const client = getClient(clientId);
  if (!client) {
    return { error: 'invalid_client' };
  }
  if (!clientAllowsRedirect(client, redirectUri)) {
    return { error: 'invalid_grant', error_description: 'redirect_uri mismatch' };
  }

  const authRecord = consumeAuthCode(code);
  if (!authRecord || authRecord.clientId !== clientId) {
    return { error: 'invalid_grant', error_description: 'Invalid or expired code' };
  }
  if (authRecord.redirectUri !== redirectUri) {
    return { error: 'invalid_grant', error_description: 'redirect_uri mismatch' };
  }
  if (
    !verifyPkce(
      codeVerifier,
      authRecord.codeChallenge,
      authRecord.codeChallengeMethod,
    )
  ) {
    return { error: 'invalid_grant', error_description: 'PKCE verification failed' };
  }

  return issueTokens(clientId, authRecord.scope);
}

export function refreshAccessToken(body) {
  const refreshToken = body?.refresh_token;
  const clientId = body?.client_id;
  if (!refreshToken || !clientId) {
    return { error: 'invalid_request' };
  }

  const client = getClient(clientId);
  if (!client) {
    return { error: 'invalid_client' };
  }

  const record = consumeRefreshToken(refreshToken);
  if (!record || record.clientId !== clientId) {
    return { error: 'invalid_grant', error_description: 'Invalid refresh token' };
  }

  return issueTokens(clientId, record.scope);
}

/** Returns true when Bearer token is a valid OAuth access token for this server. */
export function isValidOAuthAccessToken(token) {
  if (!token || !isOAuthEnabled()) return false;
  return Boolean(getAccessToken(token));
}
