import { getAccessToken } from './oauth-store.js';
import { getSupabaseUserFromRequest, isSupabaseAuthEnabled } from './supabase-auth.js';

function isValidOAuthAccessToken(token) {
  if (!getPortfolioApiKey()) return false;
  if (!token) return false;
  return Boolean(getAccessToken(token));
}

/**
 * Optional API key protection for portfolio read/write and analytics routes.
 * Set PORTFOLIO_API_KEY on Railway (recommended). PORTFOLIO_WRITE_KEY is still
 * accepted for backward compatibility.
 */
export function getPortfolioApiKey() {
  return process.env.PORTFOLIO_API_KEY || process.env.PORTFOLIO_WRITE_KEY || null;
}

export function extractPortfolioToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  const header = req.headers['x-portfolio-key'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return null;
}

export function isPortfolioApiAuthorized(req) {
  const expected = getPortfolioApiKey();
  if (!expected) return true;
  const token = extractPortfolioToken(req);
  if (!token) return false;
  if (token === expected) return true;
  return isValidOAuthAccessToken(token);
}

function headerValue(req, name) {
  if (typeof req.get === 'function') {
    return req.get(name);
  }
  const headers = req.headers ?? {};
  const key = name.toLowerCase();
  const value = headers[name] ?? headers[key];
  return typeof value === 'string' ? value : undefined;
}

function requestHost(req) {
  const forwarded = headerValue(req, 'x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerValue(req, 'host') ?? '';
}

/** Browser requests from the deployed SPA (same host as the API). */
export function isSameOriginBrowserRequest(req) {
  const secFetchSite = headerValue(req, 'sec-fetch-site');
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return true;
  }

  const origin = headerValue(req, 'origin');
  const host = requestHost(req);
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isPortfolioWebAccessAuthorized(req) {
  return isPortfolioApiAuthorized(req) || isSameOriginBrowserRequest(req);
}

/**
 * Safe auth diagnostics for logs (never includes secrets or token values).
 */
export function describePortfolioAuthAttempt(req) {
  const auth =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : null;
  const xKey = req.headers['x-portfolio-key'];
  const token = extractPortfolioToken(req);
  const expected = getPortfolioApiKey();

  let authScheme = 'missing';
  if (auth) {
    authScheme = auth.startsWith('Bearer ') ? 'bearer' : 'non-bearer';
  }

  const literalEnvPlaceholder =
    (typeof auth === 'string' &&
      (auth.includes('${env:') || auth.includes('env:PORTFOLIO'))) ||
    (typeof xKey === 'string' &&
      (xKey.includes('${env:') || xKey.includes('env:PORTFOLIO')));

  let failureReason = 'ok';
  if (!expected) {
    failureReason = 'server_key_not_configured';
  } else if (!token) {
    failureReason = literalEnvPlaceholder
      ? 'env_placeholder_not_substituted'
      : auth
        ? 'malformed_authorization'
        : xKey
          ? 'empty_x_portfolio_key'
          : 'missing_credentials';
  } else if (token !== expected) {
    failureReason = literalEnvPlaceholder
      ? 'env_placeholder_not_substituted'
      : isValidOAuthAccessToken(token)
        ? 'ok'
        : 'wrong_token';
  }

  return {
    failureReason,
    authScheme,
    hasAuthorization: Boolean(auth),
    hasXPortfolioKey: typeof xKey === 'string' && xKey.length > 0,
    tokenExtracted: Boolean(token),
    tokenLength: token?.length ?? 0,
    expectedKeyLength: expected?.length ?? 0,
    literalEnvPlaceholder,
    userAgent:
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 80)
        : undefined,
  };
}

/**
 * Portfolio UI routes: Supabase session, API key, OAuth token, or legacy same-origin.
 */
export async function requirePortfolioWebAccess(req, res, next, options = {}) {
  try {
    if (isPortfolioApiAuthorized(req)) {
      req.portfolioRowId = 'default';
      next();
      return;
    }

    const user = await getSupabaseUserFromRequest(req);
    if (user) {
      req.portfolioRowId = user.id;
      req.supabaseUser = user;
      next();
      return;
    }

    if (!isSupabaseAuthEnabled() && isSameOriginBrowserRequest(req)) {
      req.portfolioRowId = 'default';
      next();
      return;
    }

    const diagnostics = describePortfolioAuthAttempt(req);
    if (req.path === '/mcp' || process.env.LOG_AUTH_DEBUG === 'true') {
      console.warn(
        `[auth] ${req.method} ${req.path} unauthorized (web)`,
        JSON.stringify(diagnostics),
      );
    }

    if (options.wwwAuthenticate) {
      res.set('WWW-Authenticate', options.wwwAuthenticate(req));
    }

    res.status(401).json({
      error: 'Unauthorized',
      hint: isSupabaseAuthEnabled()
        ? 'Sign in with your account or use Authorization: Bearer <PORTFOLIO_API_KEY>'
        : 'Open the portfolio tracker in your browser or use Authorization: Bearer <PORTFOLIO_API_KEY>',
    });
  } catch (err) {
    next(err);
  }
}

export function requirePortfolioApiKey(req, res, next, options = {}) {
  if (isPortfolioApiAuthorized(req)) {
    next();
    return;
  }

  const diagnostics = describePortfolioAuthAttempt(req);
  const logMcp =
    req.path === '/mcp' || process.env.LOG_AUTH_DEBUG === 'true';
  if (logMcp) {
    console.warn(
      `[auth] ${req.method} ${req.path} unauthorized`,
      JSON.stringify(diagnostics),
    );
  }

  if (options.wwwAuthenticate) {
    res.set('WWW-Authenticate', options.wwwAuthenticate(req));
  }

  const body = {
    error: 'Unauthorized',
    hint:
      diagnostics.failureReason === 'env_placeholder_not_substituted'
        ? 'Cursor sent the literal "${env:PORTFOLIO_API_KEY}" string. In Agents → MCP, paste your full 64-char Railway key into the header value (not ${env:...}).'
        : 'Use OAuth (ChatGPT) or Authorization: Bearer <PORTFOLIO_API_KEY> / X-Portfolio-Key',
  };
  if (process.env.LOG_AUTH_DEBUG === 'true') {
    body.auth = diagnostics;
  }
  res.status(401).json(body);
}
