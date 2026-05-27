/**
 * In-memory OAuth state (clients, codes, tokens).
 * Tokens are lost on process restart — acceptable for a single Railway instance.
 */

/** @type {Map<string, { clientId: string, redirectUris: string[], clientName?: string, createdAt: number }>} */
const clients = new Map();

/** @type {Map<string, { clientId: string, redirectUri: string, codeChallenge: string, codeChallengeMethod: string, scope: string, expiresAt: number }>} */
const authCodes = new Map();

/** @type {Map<string, { clientId: string, scope: string, expiresAt: number }>} */
const accessTokens = new Map();

/** @type {Map<string, { clientId: string, scope: string, accessToken: string, expiresAt: number }>} */
const refreshTokens = new Map();

export function registerClient(record) {
  clients.set(record.clientId, record);
  return record;
}

export function getClient(clientId) {
  return clients.get(clientId) ?? null;
}

export function saveAuthCode(code, record) {
  authCodes.set(code, record);
}

export function consumeAuthCode(code) {
  const record = authCodes.get(code);
  if (!record) return null;
  authCodes.delete(code);
  if (record.expiresAt < Date.now()) return null;
  return record;
}

export function saveAccessToken(token, record) {
  accessTokens.set(token, record);
}

export function getAccessToken(token) {
  const record = accessTokens.get(token);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    accessTokens.delete(token);
    return null;
  }
  return record;
}

export function saveRefreshToken(token, record) {
  refreshTokens.set(token, record);
}

export function consumeRefreshToken(token) {
  const record = refreshTokens.get(token);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    refreshTokens.delete(token);
    return null;
  }
  refreshTokens.delete(token);
  return record;
}

/** Test helper — clears all in-memory OAuth state. */
export function resetOAuthStore() {
  clients.clear();
  authCodes.clear();
  accessTokens.clear();
  refreshTokens.clear();
}
