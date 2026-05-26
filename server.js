import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isCloudStorageEnabled,
  loadPortfolio,
  resetPortfolioToSeed,
  savePortfolio,
} from './server/portfolio-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    cloudStorage: isCloudStorageEnabled(),
  });
});

app.get('/api/portfolio', async (_req, res) => {
  try {
    const result = await loadPortfolio();
    res.json({
      portfolio: result.data,
      source: result.source,
      updatedAt: result.updatedAt,
      cloudStorage: isCloudStorageEnabled(),
    });
  } catch (err) {
    console.error('GET /api/portfolio', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load portfolio',
    });
  }
});

app.post('/api/portfolio/reset', async (req, res) => {
  const writeKey = process.env.PORTFOLIO_WRITE_KEY;
  if (writeKey) {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-portfolio-key'];
    if (token !== writeKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const result = await resetPortfolioToSeed();
    res.json({
      portfolio: result.data,
      source: result.source,
      updatedAt: result.updatedAt,
      cloudStorage: isCloudStorageEnabled(),
    });
  } catch (err) {
    console.error('POST /api/portfolio/reset', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to reset portfolio',
    });
  }
});

app.put('/api/portfolio', async (req, res) => {
  const writeKey = process.env.PORTFOLIO_WRITE_KEY;
  if (writeKey) {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-portfolio-key'];
    if (token !== writeKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

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
    const result = await savePortfolio(portfolio);
    res.json({ ok: true, updatedAt: result.updatedAt });
  } catch (err) {
    console.error('PUT /api/portfolio', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to save portfolio',
    });
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
});
