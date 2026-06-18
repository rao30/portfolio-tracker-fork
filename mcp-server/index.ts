#!/usr/bin/env node
/**
 * MCP server for Rental Snowball — exposes live portfolio + simulation insights to LLMs.
 *
 * Configure in Cursor (.cursor/mcp.json):
 *   PORTFOLIO_TRACKER_URL=https://your-app.up.railway.app
 *   PORTFOLIO_API_KEY=<same as Railway PORTFOLIO_API_KEY>
 *
 * Or use the hosted Railway endpoint:
 *   url=https://your-app.up.railway.app/mcp
 *   Authorization: Bearer <PORTFOLIO_API_KEY>
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export interface RentalSnowballMcpConfig {
  baseUrl?: string;
  apiKey?: string;
}

function normalizeBaseUrl(url: string | undefined) {
  return (url ?? '').replace(/\/$/, '');
}

const strategySchema = z
  .enum([
    'highestRate',
    'highestPiPerDollar',
    'highestCashflowBoost',
    'lowestBalance',
    'lowestDscr',
    'highestInterestCost',
    'baseline',
  ])
  .optional()
  .describe('Payoff strategy id (default highestRate)');

const scenarioSchema = z
  .string()
  .optional()
  .describe(
    'Scenario preset id (base, vacancy10, rateShock1, …) or sell-<property name>',
  );

const portfolioYearSchema = z
  .number()
  .int()
  .min(1)
  .max(20)
  .optional()
  .describe('Portfolio dashboard year (1 = anchor / current year)');

export function createRentalSnowballMcpServer(
  config: RentalSnowballMcpConfig = {},
) {
  const baseUrl = normalizeBaseUrl(
    config.baseUrl ?? process.env.PORTFOLIO_TRACKER_URL,
  );
  const apiKey =
    config.apiKey ??
    process.env.PORTFOLIO_API_KEY ??
    process.env.PORTFOLIO_WRITE_KEY ??
    '';

  function requireRemoteConfig() {
    if (!baseUrl) {
      throw new Error(
        'Set PORTFOLIO_TRACKER_URL to your Railway app URL (e.g. https://your-app.up.railway.app)',
      );
    }
    if (!apiKey) {
      throw new Error(
        'Set PORTFOLIO_API_KEY (must match PORTFOLIO_API_KEY on Railway)',
      );
    }
  }

  async function trackerFetch(path: string, init: RequestInit = {}) {
    requireRemoteConfig();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    headers.set('Accept', 'application/json');
    if (init.body) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Invalid JSON from ${path}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: string }).error)
          : res.statusText;
      throw new Error(`${res.status} ${path}: ${err}`);
    }
    return json;
  }

  async function analyze(body: Record<string, unknown>) {
    return trackerFetch('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  const server = new McpServer({
    name: 'rental-snowball-portfolio',
    version: '1.0.0',
  });

server.tool(
  'get_portfolio',
  'Fetch the live rental portfolio (properties, loans, rents, tax profile) from Railway/Supabase.',
  {},
  async () => {
    const data = await trackerFetch('/api/portfolio');
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'list_analyzer_capabilities',
  'List payoff strategies, stress-test scenarios, and available MCP tools.',
  {},
  async () => {
    const data = await trackerFetch('/api/analyze/capabilities');
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'portfolio_current_metrics',
  'Current portfolio totals: equity, debt, LTV, property count (from property inputs, not simulation).',
  {},
  async () => {
    const data = await analyze({ action: 'current_metrics' });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'simulate_payoff_strategy',
  'Run the snowball simulator for one strategy and scenario; returns payoff timeline, interest, and year horizons.',
  {
    strategy: strategySchema,
    scenario: scenarioSchema,
    includeHistory: z
      .boolean()
      .optional()
      .describe('Include monthly equity/cashflow series (large)'),
  },
  async ({ strategy, scenario, includeHistory }) => {
    const data = await analyze({
      action: 'simulate',
      strategy: strategy ?? 'highestRate',
      scenario: scenario ?? 'base',
      includeHistory: includeHistory ?? false,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'compare_payoff_strategies',
  'Rank all payoff strategies by months to debt-free and total interest paid.',
  {
    includeBaseline: z.boolean().optional(),
  },
  async ({ includeBaseline }) => {
    const data = await analyze({
      action: 'compare_strategies',
      includeBaseline: includeBaseline ?? true,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'portfolio_insights',
  'Narrative insights, per-property metrics, year snapshot, and horizon equity — uses the full simulation engine.',
  {
    strategy: strategySchema,
    scenario: scenarioSchema,
    portfolioYear: portfolioYearSchema,
  },
  async ({ strategy, scenario, portfolioYear }) => {
    const data = await analyze({
      action: 'insights',
      strategy: strategy ?? 'highestRate',
      scenario: scenario ?? 'base',
      portfolioYear: portfolioYear ?? 1,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'property_cashflow_breakdown',
  'Per-property cap rate, DSCR, cash-on-cash, and warnings at a portfolio year.',
  {
    strategy: strategySchema,
    scenario: scenarioSchema,
    portfolioYear: portfolioYearSchema,
  },
  async ({ strategy, scenario, portfolioYear }) => {
    const data = await analyze({
      action: 'property_breakdown',
      strategy: strategy ?? 'highestRate',
      scenario: scenario ?? 'base',
      portfolioYear: portfolioYear ?? 1,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'tax_planner_summary',
  'Depreciation, passive loss, and estimated tax savings from the portfolio tax profile.',
  {},
  async () => {
    const data = await analyze({ action: 'tax' });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'solve_extra_budget_goal',
  'Minimum extra monthly snowball budget to hit a debt-free month or equity target.',
  {
    goalType: z
      .enum(['debt_free_by_month', 'equity_at_month'])
      .optional()
      .describe('Goal type'),
    goalMonth: z.number().int().positive().describe('Target simulation month'),
    goalEquity: z
      .number()
      .optional()
      .describe('Required when goalType is equity_at_month'),
    strategy: strategySchema,
  },
  async ({ goalType, goalMonth, goalEquity, strategy }) => {
    const data = await analyze({
      action: 'solve_budget',
      goalType: goalType ?? 'debt_free_by_month',
      goalMonth,
      goalEquity,
      strategy: strategy ?? 'highestRate',
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'list_agent_feature_claims',
  'List active parallel-agent feature claims so cloud agents avoid building the same feature twice.',
  {
    includeCompleted: z
      .boolean()
      .optional()
      .describe('Include completed and abandoned claims'),
  },
  async ({ includeCompleted }) => {
    const data = await trackerFetch(
      `/api/agent-features?includeCompleted=${includeCompleted ? 'true' : 'false'}`,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'claim_agent_feature',
  'Claim a feature slug before building it. Returns 409 if another agent already holds an active claim.',
  {
    featureSlug: z
      .string()
      .describe('Lowercase kebab-case id, e.g. refinance-radar or tax-shield'),
    featureTitle: z.string().describe('Human-readable feature name'),
    agentSessionId: z.string().describe('Unique id for this agent run'),
    branchName: z.string().optional().describe('Git branch being used'),
    rationale: z.string().optional().describe('Why this feature was chosen'),
    claimHours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .optional()
      .describe('Claim TTL in hours (default 48)'),
  },
  async ({ featureSlug, featureTitle, agentSessionId, branchName, rationale, claimHours }) => {
    const data = await trackerFetch('/api/agent-features/claim', {
      method: 'POST',
      body: JSON.stringify({
        featureSlug,
        featureTitle,
        agentSessionId,
        branchName,
        rationale,
        claimHours,
      }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  'update_agent_feature_claim',
  'Update claim status (in_progress, completed, abandoned), branch, or PR URL.',
  {
    featureSlug: z.string(),
    status: z.enum(['claimed', 'in_progress', 'completed', 'abandoned']).optional(),
    branchName: z.string().optional(),
    prUrl: z.string().optional(),
    rationale: z.string().optional(),
    extendHours: z.number().int().min(1).max(168).optional(),
  },
  async ({ featureSlug, status, branchName, prUrl, rationale, extendHours }) => {
    const data = await trackerFetch(`/api/agent-features/${encodeURIComponent(featureSlug)}`, {
      method: 'PUT',
      body: JSON.stringify({ status, branchName, prUrl, rationale, extendHours }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

  return server;
}

async function main() {
  const server = createRentalSnowballMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
