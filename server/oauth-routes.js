import express, { Router } from 'express';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  createAuthorizationRedirect,
  dynamicClientRegister,
  exchangeAuthorizationCode,
  isOAuthEnabled,
  OAUTH_SCOPE,
  refreshAccessToken,
} from './oauth.js';

const urlencoded = express.urlencoded({ extended: false });

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function authorizeFormHtml(query, errorMessage) {
  const fields = [
    'client_id',
    'redirect_uri',
    'state',
    'code_challenge',
    'code_challenge_method',
    'response_type',
    'scope',
  ];
  const hidden = fields
    .filter((name) => query[name])
    .map(
      (name) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(query[name])}" />`,
    )
    .join('\n');

  const error = errorMessage
    ? `<p class="error">${escapeHtml(errorMessage)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rental Snowball — Authorize MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; }
    label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
    input[type=password] { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1rem; padding: 0.5rem 1rem; }
    .error { color: #b00020; }
    p.hint { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Authorize MCP access</h1>
  <p class="hint">Enter your portfolio API key (same value as <code>PORTFOLIO_API_KEY</code> on Railway). ChatGPT and other OAuth clients use this once to obtain a bearer token.</p>
  ${error}
  <form method="post" action="/oauth/authorize">
    ${hidden}
    <label for="portfolio_key">Portfolio API key</label>
    <input id="portfolio_key" name="portfolio_key" type="password" autocomplete="off" required />
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
}

/**
 * @param {(req: import('express').Request) => string} getBaseUrl
 */
export function createOAuthRouter(getBaseUrl) {
  const router = Router();

  router.get('/.well-known/oauth-protected-resource', (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).json({ error: 'OAuth requires PORTFOLIO_API_KEY' });
      return;
    }
    res.json(buildProtectedResourceMetadata(getBaseUrl(req)));
  });

  router.get('/.well-known/oauth-protected-resource/*', (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).json({ error: 'OAuth requires PORTFOLIO_API_KEY' });
      return;
    }
    res.json(buildProtectedResourceMetadata(getBaseUrl(req)));
  });

  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).json({ error: 'OAuth requires PORTFOLIO_API_KEY' });
      return;
    }
    res.json(buildAuthorizationServerMetadata(getBaseUrl(req)));
  });

  router.post('/oauth/register', (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).json({ error: 'OAuth requires PORTFOLIO_API_KEY' });
      return;
    }
    const result = dynamicClientRegister(req.body);
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.get('/oauth/authorize', (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).send('OAuth is not configured');
      return;
    }
    if (req.query.response_type !== 'code') {
      res.status(400).send('Only response_type=code is supported');
      return;
    }
    res.type('html').send(authorizeFormHtml(req.query));
  });

  router.post('/oauth/authorize', urlencoded, (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).send('OAuth is not configured');
      return;
    }

    const result = createAuthorizationRedirect({
      clientId: req.body.client_id,
      redirectUri: req.body.redirect_uri,
      state: req.body.state,
      codeChallenge: req.body.code_challenge,
      codeChallengeMethod: req.body.code_challenge_method,
      scope: req.body.scope || OAUTH_SCOPE,
      portfolioKey: req.body.portfolio_key,
    });

    if (result.error) {
      if (result.error === 'access_denied') {
        res
          .type('html')
          .send(authorizeFormHtml(req.body, 'Invalid portfolio key. Try again.'));
        return;
      }
      res.status(400).json(result);
      return;
    }

    res.redirect(302, result.redirect);
  });

  router.post('/oauth/token', urlencoded, (req, res) => {
    if (!isOAuthEnabled()) {
      res.status(503).json({ error: 'OAuth requires PORTFOLIO_API_KEY' });
      return;
    }

    const grantType = req.body.grant_type;
    let result;
    if (grantType === 'authorization_code') {
      result = exchangeAuthorizationCode(req.body);
    } else if (grantType === 'refresh_token') {
      result = refreshAccessToken(req.body);
    } else {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }

    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}
