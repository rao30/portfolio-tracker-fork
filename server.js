import express from 'express';
import { existsSync } from 'fs';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRentalSnowballMcpServer } from './mcp-server/dist/index.js';
import { analyzeFromPortfolio, listCapabilities } from './server/analytics-handlers.js';
import {
  getPortfolioApiKey,
  requirePortfolioApiKey,
  requirePortfolioWebAccess,
} from './server/auth.js';
import { buildWwwAuthenticateHeader } from './server/oauth.js';
import { createOAuthRouter } from './server/oauth-routes.js';
import { isSupabaseAuthEnabled } from './server/supabase-auth.js';
import {
  isCloudStorageEnabled,
  loadPortfolio,
  resetPortfolioToSeed,
  savePortfolio,
} from './server/portfolio-store.js';
import { bootstrapAdminUserIfConfigured } from './server/startup-bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

function getRequestOrigin(req) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  return `${proto}://${host}`;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    cloudStorage: isCloudStorageEnabled(),
    apiKeyRequired: Boolean(getPortfolioApiKey()),
    oauthEnabled: Boolean(getPortfolioApiKey()),
    supabaseAuthEnabled: isSupabaseAuthEnabled(),
  });
});

app.use(createOAuthRouter(getRequestOrigin));

app.get('/api/portfolio', requirePortfolioWebAccess, async (req, res) => {
  try {
    const result = await loadPortfolio(req.portfolioRowId);
    res.json({
      portfolio: result.data,
      source: result.source,
      updatedAt: result.updatedAt,
      cloudStorage: isCloudStorageEnabled(),
      seedVersion: result.data?.seed_version,
      upgradedFromVersion: result.upgradedFromVersion,
      userId: req.supabaseUser?.id,
    });
  } catch (err) {
    console.error('GET /api/portfolio', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load portfolio',
    });
  }
});

app.post('/api/portfolio/reset', requirePortfolioWebAccess, async (req, res) => {
  try {
    const result = await resetPortfolioToSeed(req.portfolioRowId);
    res.json({
      portfolio: result.data,
      source: result.source,
      updatedAt: result.updatedAt,
      cloudStorage: isCloudStorageEnabled(),
      seedVersion: result.data?.seed_version,
    });
  } catch (err) {
    console.error('POST /api/portfolio/reset', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to reset portfolio',
    });
  }
});

app.post('/api/portfolio/market-values', requirePortfolioWebAccess, async (req, res) => {
  const dryRun = req.body?.dryRun === true;

  try {
    const loaded = await loadPortfolio(req.portfolioRowId);
    const portfolio = structuredClone(loaded.data);
    const refresh = await refreshPortfolioMarketValues(portfolio, { dryRun });

    if (!dryRun && refresh.results.length > 0) {
      if (isCloudStorageEnabled()) {
        await savePortfolio(portfolio, req.portfolioRowId);
      }
    }

    res.json({
      ok: refresh.errors.length === 0,
      dryRun,
      updatedAt: refresh.updatedAt,
      results: refresh.results,
      errors: refresh.errors,
      portfolio: dryRun ? undefined : portfolio,
      cloudSaved: !dryRun && isCloudStorageEnabled() && refresh.results.length > 0,
    });
  } catch (err) {
    console.error('POST /api/portfolio/market-values', err);
    res.status(err.message?.includes('RENTCAST') ? 503 : 500).json({
      error: err instanceof Error ? err.message : 'Failed to refresh market values',
    });
  }
});

app.put('/api/portfolio', requirePortfolioWebAccess, async (req, res) => {
  if (!isCloudStorageEnabled()) {
    res.status(503).json({ error: 'Cloud storage is not configured' });
    return;
  }

  const portfolio = req.body?.portfolio ?? req.body;
  if (!portfolio || typeof portfolio !== 'object') {
    res.status(400).json({ error: 'Expected portfolio JSON body' });
    return;
  }

  try {
    const result = await savePortfolio(portfolio, req.portfolioRowId);
    res.json({ ok: true, updatedAt: result.updatedAt });
  } catch (err) {
    console.error('PUT /api/portfolio', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to save portfolio',
    });
  }
});

app.get('/api/analyze/capabilities', requirePortfolioApiKey, (_req, res) => {
  res.json(listCapabilities());
});

app.post('/api/analyze', requirePortfolioApiKey, async (req, res) => {
  try {
    const portfolio = req.body?.portfolio;
    let data;
    if (portfolio && typeof portfolio === 'object') {
      data = analyzeFromPortfolio(portfolio, req.body);
    } else {
      const loaded = await loadPortfolio();
      data = analyzeFromPortfolio(loaded.data, req.body);
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('POST /api/analyze', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Analysis failed',
    });
  }
});

function requireMcpApiKey(req, res, next) {
  const expected = getPortfolioApiKey();
  if (!expected) {
    res.status(503).json({
      error: 'MCP remote access requires PORTFOLIO_API_KEY on the server',
    });
    return;
  }
  requirePortfolioApiKey(req, res, next, {
    wwwAuthenticate: (r) => buildWwwAuthenticateHeader(getRequestOrigin(r)),
  });
}

app.all('/mcp', requireMcpApiKey, async (req, res) => {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.set('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = getPortfolioApiKey();
  const server = createRentalSnowballMcpServer({
    baseUrl: process.env.PORTFOLIO_TRACKER_URL || getRequestOrigin(req),
    apiKey,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    server.close().catch((err) => {
      console.error('MCP close failed:', err);
    });
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(`${req.method} /mcp`, err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'MCP request failed',
      });
    }
  }
});

const distDir = path.join(__dirname, 'dist');
const indexHtml = path.join(distDir, 'index.html');

if (!existsSync(indexHtml)) {
  console.error(
    `Missing ${indexHtml}. The build step must run before start (npm run build).`,
  );
  process.exit(1);
}

app.use(express.static(distDir));

app.get('*', (_req, res) => {
  res.sendFile(indexHtml, (err) => {
    if (err) {
      console.error('sendFile failed:', err);
      res.status(500).send('Failed to load app');
    }
  });
});

app.listen(port, host, () => {
  console.log(`Rental Snowball listening on ${host}:${port}`);
  console.log(
    `Cloud portfolio storage: ${isCloudStorageEnabled() ? 'enabled' : 'disabled (using repo seed only)'}`,
  );
  void bootstrapAdminUserIfConfigured().catch((err) => {
    console.error('[bootstrap] Failed:', err instanceof Error ? err.message : err);
  });
});
