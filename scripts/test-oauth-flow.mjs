#!/usr/bin/env node
/**
 * End-to-end OAuth + MCP auth smoke test against a running server.
 * Usage: PORTFOLIO_API_KEY=secret node server.js &
 *        node scripts/test-oauth-flow.mjs http://127.0.0.1:3000 secret
 */
import { createHash, randomBytes } from 'crypto';

const base = process.argv[2] || 'http://127.0.0.1:3000';
const portfolioKey = process.argv[3];
if (!portfolioKey) {
  console.error('Usage: node scripts/test-oauth-flow.mjs <baseUrl> <portfolioKey>');
  process.exit(1);
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function main() {
  const protectedRes = await fetch(`${base}/.well-known/oauth-protected-resource`);
  if (!protectedRes.ok) throw new Error(`protected-resource ${protectedRes.status}`);
  const protectedJson = await protectedRes.json();
  console.log('protected-resource ok', protectedJson.resource);

  const asRes = await fetch(`${base}/.well-known/oauth-authorization-server`);
  if (!asRes.ok) throw new Error(`authorization-server ${asRes.status}`);
  const asJson = await asRes.json();
  console.log('authorization-server ok', asJson.token_endpoint);

  const redirectUri = 'https://localhost/oauth/callback';
  const regRes = await fetch(`${base}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'oauth-smoke',
      redirect_uris: [redirectUri],
    }),
  });
  if (!regRes.ok) throw new Error(`register ${regRes.status} ${await regRes.text()}`);
  const { client_id: clientId } = await regRes.json();
  console.log('register ok', clientId);

  const { verifier, challenge } = pkce();
  const authRes = await fetch(`${base}/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      portfolio_key: portfolioKey,
    }),
    redirect: 'manual',
  });
  if (authRes.status !== 302) {
    throw new Error(`authorize ${authRes.status} ${await authRes.text()}`);
  }
  const location = authRes.headers.get('location');
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error('missing code in redirect');
  console.log('authorize ok');

  const tokenRes = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token: accessToken } = await tokenRes.json();
  console.log('token ok');

  const mcpRes = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'oauth-smoke', version: '1.0.0' },
      },
    }),
  });
  const wwwAuth = mcpRes.headers.get('www-authenticate');
  if (mcpRes.status === 401) {
    console.log('mcp 401 www-authenticate', wwwAuth);
    throw new Error('MCP rejected OAuth bearer token');
  }
  console.log('mcp initialize status', mcpRes.status);
  if (mcpRes.status >= 500) {
    throw new Error(`mcp server error ${mcpRes.status}`);
  }

  const badRes = await fetch(`${base}/mcp`, { method: 'POST' });
  if (badRes.status !== 401) throw new Error(`expected 401, got ${badRes.status}`);
  if (!badRes.headers.get('www-authenticate')?.includes('resource_metadata')) {
    throw new Error('missing WWW-Authenticate resource_metadata on /mcp');
  }
  console.log('mcp 401 challenge ok');
  console.log('OAuth flow smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
