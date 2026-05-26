# Rental Snowball

A single-page app that simulates aggressive early-payoff strategies across a rental property portfolio. Compare avalanche, snowball, cashflow-boost, and other targeting rules side by side.

## Quick start

```bash
npm install
npm run dev
npm test
npm run build
npm start
```

Open the dev server URL (usually `http://localhost:5173`). The dashboard loads [`public/data/portfolio.json`](public/data/portfolio.json) on first visit.

After building, `npm start` serves the production build at `http://localhost:3000` — same as Railway.

## Editing your portfolio

**Recommended — UI + cloud (Supabase)**

1. Click **+ Add property** in the portfolio table, or edit any cell inline.
2. Changes auto-save to Supabase (debounced) when Railway has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set.
3. The header shows **Synced to cloud** when persistence is active.

**Option A — commit JSON**

Edit [`public/data/portfolio.json`](public/data/portfolio.json) directly (snake_case fields). Commit and push; the next API load seeds Supabase if the row is empty, or use **Reset** to push repo defaults to the cloud.

**Option B — local only (no Supabase)**

Without Supabase env vars, edits save to `localStorage` in the browser. Use **Export JSON** to download state and optionally update `public/data/portfolio.json`.

**Reset to defaults** reloads [`public/data/portfolio.json`](public/data/portfolio.json) from the server and overwrites Supabase when cloud storage is on.

If the header shows **Synced to cloud** but properties are missing, an older cloud snapshot was loaded. Click **Reset to defaults**, or bump `seed_version` in the repo (deployed builds auto-upgrade cloud when behind).

### Portfolio JSON schedule fields

Simulation timing and seller/refi terms live in [`public/data/portfolio.json`](public/data/portfolio.json), not in code.

| Level | Field | Meaning |
|-------|--------|---------|
| Portfolio | `simulation_anchor_year`, `simulation_anchor_month` | Calendar date for simulation month 1 |
| Portfolio | `default_refi_annual_rate`, `default_refi_term_months` | Fallback refi terms for seller loans |
| Property | `financing_type` | `conventional` or `seller` |
| Property | `close_year`, `close_month_calendar` | Acquisition date (calendar) |
| Property | `balloon_months` | Months on seller financing before refi |
| Property | `seller_amortization_months` | Seller P&I amortization (e.g. 240) |
| Property | `refi_year`, `refi_month` | Calendar date when balloon refis |
| Property | `refi_annual_rate`, `refi_term_months` | Post-balloon conventional loan terms |
| Property | `utilities_rent_rate` | Utilities as a share of gross rent (e.g. `0.15`); scales with rent in simulation |

The engine converts calendar dates to simulation months from the anchor. Seller `monthly_payment` and `annual_interest_rate` in JSON are the values used until refi.

> Balances and loan terms are sensitive. Use a **private repository**, set `PORTFOLIO_API_KEY` on Railway, and never commit service role keys.

## LLM / MCP access (Cursor, Claude, etc.)

An MCP server lets assistants read your **live** portfolio from Railway and run the same simulation engine as the dashboard (strategy comparison, tax planner, per-property DSCR, budget solvers).

### 1. Protect the Railway API

On Railway, set a long random secret:

```bash
openssl rand -hex 32
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORTFOLIO_API_KEY` | **Yes** (recommended) | Protects `GET /api/portfolio`, `POST /api/analyze`, and writes |
| `VITE_PORTFOLIO_API_KEY` | Yes (if UI uses cloud) | Same value at **build** time so the browser can load/save |

Without `PORTFOLIO_API_KEY`, portfolio endpoints stay open — fine for local dev only.

### 2. Cursor MCP config

Copy [`.cursor/mcp.json.example`](.cursor/mcp.json.example) to `.cursor/mcp.json` (gitignored) and fill in:

```json
{
  "mcpServers": {
    "rental-snowball": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "PORTFOLIO_TRACKER_URL": "https://your-app.up.railway.app",
        "PORTFOLIO_API_KEY": "same-secret-as-railway"
      }
    }
  }
}
```

Run `npm run build` once so `mcp-server/dist/index.js` exists.

### 3. Tools exposed to the LLM

| Tool | What it does |
|------|----------------|
| `get_portfolio` | Live portfolio JSON (properties, loans, tax profile) |
| `list_analyzer_capabilities` | Strategy and scenario ids |
| `portfolio_current_metrics` | Current LTV, equity, debt totals |
| `simulate_payoff_strategy` | Full snowball run for one strategy/scenario |
| `compare_payoff_strategies` | Rank all payoff strategies |
| `portfolio_insights` | Narratives + year metrics + per-property breakdown |
| `property_cashflow_breakdown` | Cap rate, DSCR, cash-on-cash by property |
| `tax_planner_summary` | Depreciation and passive loss summary |
| `solve_extra_budget_goal` | Min extra budget for debt-free or equity target |

Direct HTTP (same auth): `POST /api/analyze` with body `{ "action": "insights", "strategy": "highestRate" }` — loads cloud portfolio when `portfolio` is omitted.

### Current market values (defaults)

| Property | Market value |
|----------|----------------|
| Lisa Ln (Cedar Hill) | $320,000 |
| Brookwood (Duncanville) | $400,000 |
| Ridge Rock (Duncanville) | $450,000 |
| Wendy (Irving) | $460,000 |
| Park Blvd (Plano) | $500,000 |

## Railway deployment

Same pattern as [bake-house](https://github.com/rao30/bake-house): a small Express server serves the built Vite app from `dist/`, and Railway auto-detects the Node project.

### One-time setup

1. In [Railway](https://railway.app/), create a **New Project → Deploy from GitHub repo**.
2. Select `portfolio-tracker` (works with private repos).
3. Railway runs `npm install`, `npm run build`, then `npm start` automatically.
4. After a successful deploy, Railway should detect the app listening on `$PORT` and show a **Generate Domain** prompt on the service tile. If not, go to **Settings → Networking → Generate Domain**.

Every push to `main` triggers a new deploy — no GitHub Actions workflow or extra secrets required.

### Railway environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes (for cloud save) | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | Yes (for cloud save) | `sb_secret_...` from Supabase **Settings → API Keys** (preferred) |
| `SUPABASE_SERVICE_ROLE_KEY` | Alt | Legacy service role JWT if you have not migrated to secret keys yet |
| `PORTFOLIO_API_KEY` | **Recommended** | Protects portfolio read, analyze API, and writes (`Bearer` or `X-Portfolio-Key`) |
| `PORTFOLIO_WRITE_KEY` | Legacy | Same as API key if `PORTFOLIO_API_KEY` unset |
| `VITE_PORTFOLIO_API_KEY` | If UI + key | Build-time key for browser `/api/portfolio` |
| `VITE_PORTFOLIO_WRITE_KEY` | Legacy | Alias for `VITE_PORTFOLIO_API_KEY` |

Copy from [`.env.example`](.env.example). Without Supabase vars, the app still runs using `public/data/portfolio.json` and browser `localStorage`.

**Important:** Do not set a manual `PORT` variable in Railway unless you change the app to match. The server listens on Railway's injected `$PORT` at `0.0.0.0`, which lets Railway auto-detect the target port for your domain.

### Deploy troubleshooting

If the deploy fails at **build** with `tsc: not found` or `vite: not found`, Railway installed production-only dependencies. This repo includes [`nixpacks.toml`](nixpacks.toml) so `npm ci --include=dev` runs before `npm run build`.

If the deploy fails at **healthcheck**, confirm the build succeeded (`dist/index.html` exists) and the service exposes `/api/health`. Check deploy logs for `Missing dist/index.html`.

| Variable | Accepts |
|----------|---------|
| `SUPABASE_SECRET_KEY` | New `sb_secret_...` key (preferred) |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy service role JWT (still works) |

### Local dev with cloud sync

```bash
cp .env.example .env   # fill in Supabase keys
export $(grep -v '^#' .env | xargs)
npm run dev:all        # Vite + API on :3000, proxied /api
```

### How it works

| Phase | Command |
|-------|---------|
| Build | `npm run build` (TypeScript + Vite → `dist/`) |
| Start | `node server.js` (Express on `0.0.0.0:$PORT`) |
| Config | [`railway.json`](railway.json) sets build/start commands and a `/` healthcheck |

The app is served from `/` (no subpath), so `VITE_BASE` defaults to `/`.

## Strategies

| Strategy | Rule |
|----------|------|
| Highest Rate (Avalanche) | Pay extra toward highest `annualInterestRate` first |
| Highest P&I per $ Balance | Highest `monthlyPayment / balance` first |
| Highest Cashflow Boost | Highest `monthlyPayment` first (frees cashflow fastest) |
| Lowest Balance (Snowball) | Smallest balance first (quick wins) |
| Baseline | Scheduled P&I only — no extra budget, no snowball rollover |

Each month the simulator pools your extra budget plus freed P&I from paid-off loans, pays all scheduled P&I, then dumps the pool on the current target loan.

## Adding a new strategy

In [`src/lib/snowball.ts`](src/lib/snowball.ts):

1. Add a function to `STRATEGIES` that returns property names in payoff priority order.
2. Add a label in `STRATEGY_LABELS`.

The strategy dropdown and comparison chart pick up new entries automatically.

```typescript
export const STRATEGIES = {
  // ...
  myStrategy: (properties) =>
    [...properties].sort(/* your rule */).map((p) => p.name),
};

export const STRATEGY_LABELS = {
  // ...
  myStrategy: 'My Custom Strategy',
};
```

## Adding a new chart

Use the shared `ChartCard` wrapper from [`src/components/chart-theme.tsx`](src/components/chart-theme.tsx):

```tsx
import { ChartCard, chartColors, chartMargin } from './chart-theme';
import { ResponsiveContainer, LineChart, Line } from 'recharts';

export function MyChart() {
  return (
    <ChartCard title="My metric">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={chartMargin}>
          {/* axes, series, tooltip using chartColors */}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
```

Wire it into [`src/App.tsx`](src/App.tsx) with data from `SimulationResult.history` or `compareStrategies()`.

## Project structure

```
src/lib/          Simulation engine, formatters, portfolio hook
src/components/   Dashboard UI and charts
public/data/      Default portfolio JSON (seed + fallback)
server.js         Express server for Railway (API + static dist/)
server/           Supabase persistence, analytics API, auth
mcp-server/       Stdio MCP server for LLM tools (calls Railway API)
supabase/         SQL migrations (reference)
```

## License

Private use — see repository settings.
