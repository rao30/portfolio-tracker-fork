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
  return extractPortfolioToken(req) === expected;
}

/** Express middleware — 401 when key is configured and missing/wrong. */
export function requirePortfolioApiKey(req, res, next) {
  if (isPortfolioApiAuthorized(req)) {
    next();
    return;
  }
  res.status(401).json({
    error: 'Unauthorized',
    hint: 'Set Authorization: Bearer <PORTFOLIO_API_KEY> or X-Portfolio-Key header',
  });
}
