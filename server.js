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
import {
  createStrategyLabScenario,
  deleteStrategyLabScenario,
  listStrategyLabScenarios,
  updateStrategyLabScenario,
} from './server/strategy-lab-store.js';
import {
  deletePayoffPlaybook,
  getPayoffPlaybook,
  upsertPayoffPlaybook,
} from './server/payoff-playbook-store.js';
import { bootstrapAdminUserIfConfigured } from './server/startup-bootstrap.js';
import { getSupabaseClientConfig } from './server/client-config.js';
import { refreshPortfolioMarketValues } from './server/market-values.js';
import {
  createTimelineScenario,
  deleteTimelineScenario,
  isTimelineScenariosEnabled,
  listTimelineScenarios,
} from './server/timeline-scenarios.js';
import {
  getDecisionPulsePreferences,
  isDecisionPulseEnabled,
  upsertDecisionPulsePreferences,
} from './server/decision-pulse-store.js';
import {
  getPayoffLandscapePreferences,
  isPayoffLandscapeEnabled,
  upsertPayoffLandscapePreferences,
} from './server/payoff-landscape-store.js';
import {
  getBalloonSafetyPreferences,
  isBalloonSafetyEnabled,
  upsertBalloonSafetyPreferences,
} from './server/balloon-safety-store.js';

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

app.get('/api/client-config', (_req, res) => {
  const config = getSupabaseClientConfig();
  res.json({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    portfolioApiKey: config.portfolioApiKey,
    portfolioWriteKey: config.portfolioWriteKey,
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

function requireAuthenticatedUser(req, res) {
  if (!req.supabaseUser?.id) {
    res.status(401).json({
      error: 'Sign in required',
      hint: 'Strategy Lab requires an authenticated account when cloud storage is enabled.',
    });
    return false;
  }
  if (!isCloudStorageEnabled()) {
    res.status(503).json({ error: 'Cloud storage is not configured' });
    return false;
  }
  return true;
}

app.get('/api/strategy-lab', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const scenarios = await listStrategyLabScenarios(req.supabaseUser.id);
    res.json({ scenarios });
  } catch (err) {
    console.error('GET /api/strategy-lab', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load Strategy Lab',
    });
  }
});

app.post('/api/strategy-lab', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const scenario = await createStrategyLabScenario(req.supabaseUser.id, req.body ?? {});
    res.status(201).json({ scenario });
  } catch (err) {
    console.error('POST /api/strategy-lab', err);
    const status = err.statusCode ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to create scenario',
    });
  }
});

app.put('/api/strategy-lab/:id', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const scenario = await updateStrategyLabScenario(
      req.supabaseUser.id,
      req.params.id,
      req.body ?? {},
    );
    res.json({ scenario });
  } catch (err) {
    console.error('PUT /api/strategy-lab/:id', err);
    const status = err.statusCode ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to update scenario',
    });
  }
});

app.delete('/api/strategy-lab/:id', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    await deleteStrategyLabScenario(req.supabaseUser.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/strategy-lab/:id', err);
    const status = err.statusCode ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to delete scenario',
    });
  }
});

app.get('/api/payoff-playbook', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const playbook = await getPayoffPlaybook(req.supabaseUser.id);
    if (!playbook) {
      res.status(404).json({ error: 'No playbook saved' });
      return;
    }
    res.json({ playbook });
  } catch (err) {
    console.error('GET /api/payoff-playbook', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load Payoff Playbook',
    });
  }
});

app.put('/api/payoff-playbook', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const playbook = await upsertPayoffPlaybook(req.supabaseUser.id, req.body ?? {});
    res.json({ playbook });
  } catch (err) {
    console.error('PUT /api/payoff-playbook', err);
    const status = err.statusCode ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to save Payoff Playbook',
    });
  }
});

app.delete('/api/payoff-playbook', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    await deletePayoffPlaybook(req.supabaseUser.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/payoff-playbook', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to delete Payoff Playbook',
    });
  }
});

app.get('/api/decision-pulse', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const preferences = await getDecisionPulsePreferences(req.supabaseUser.id);
    res.json({ preferences, enabled: isDecisionPulseEnabled() });
  } catch (err) {
    console.error('GET /api/decision-pulse', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load Decision Pulse preferences',
    });
  }
});

app.put('/api/decision-pulse', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const preferences = await upsertDecisionPulsePreferences(
      req.supabaseUser.id,
      req.body ?? {},
    );
    res.json({ preferences });
  } catch (err) {
    console.error('PUT /api/decision-pulse', err);
    const status = err.status ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to save Decision Pulse preferences',
    });
  }
});

app.get('/api/payoff-landscape', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const preferences = await getPayoffLandscapePreferences(req.supabaseUser.id);
    res.json({ preferences, enabled: isPayoffLandscapeEnabled() });
  } catch (err) {
    console.error('GET /api/payoff-landscape', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load Payoff Landscape preferences',
    });
  }
});

app.put('/api/payoff-landscape', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const preferences = await upsertPayoffLandscapePreferences(
      req.supabaseUser.id,
      req.body ?? {},
    );
    res.json({ preferences });
  } catch (err) {
    console.error('PUT /api/payoff-landscape', err);
    const status = err.status ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to save Payoff Landscape preferences',
    });
  }
});

app.get('/api/balloon-safety', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const preferences = await getBalloonSafetyPreferences(req.supabaseUser.id);
    res.json({ preferences, enabled: isBalloonSafetyEnabled() });
  } catch (err) {
    console.error('GET /api/balloon-safety', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load Balloon Safety preferences',
    });
  }
});

app.put('/api/balloon-safety', requirePortfolioWebAccess, async (req, res) => {
  if (!requireAuthenticatedUser(req, res)) return;

  try {
    const preferences = await upsertBalloonSafetyPreferences(
      req.supabaseUser.id,
      req.body ?? {},
    );
    res.json({ preferences });
  } catch (err) {
    console.error('PUT /api/balloon-safety', err);
    const status = err.status ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to save Balloon Safety preferences',
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

function requireTimelineCloudUser(req, res, next) {
  if (!isTimelineScenariosEnabled()) {
    res.status(503).json({ error: 'Cloud storage is not configured' });
    return;
  }
  if (!req.supabaseUser?.id) {
    res.status(401).json({ error: 'Sign in required to sync timeline scenarios' });
    return;
  }
  next();
}

app.get('/api/timeline-scenarios', requirePortfolioWebAccess, requireTimelineCloudUser, async (req, res) => {
  try {
    const scenarios = await listTimelineScenarios(req.supabaseUser.id);
    res.json({ scenarios });
  } catch (err) {
    console.error('GET /api/timeline-scenarios', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to list timeline scenarios',
    });
  }
});

app.post('/api/timeline-scenarios', requirePortfolioWebAccess, requireTimelineCloudUser, async (req, res) => {
  try {
    const scenario = await createTimelineScenario(req.supabaseUser.id, req.body ?? {});
    res.status(201).json({ scenario });
  } catch (err) {
    console.error('POST /api/timeline-scenarios', err);
    const status = err.message?.includes('already exists') ? 409 : 400;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to create timeline scenario',
    });
  }
});

app.delete('/api/timeline-scenarios/:id', requirePortfolioWebAccess, requireTimelineCloudUser, async (req, res) => {
  try {
    await deleteTimelineScenario(req.supabaseUser.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/timeline-scenarios/:id', err);
    const status = err.message === 'Scenario not found' ? 404 : 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to delete timeline scenario',
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
