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

**Option A — commit JSON**

Edit [`public/data/portfolio.json`](public/data/portfolio.json) directly (snake_case fields). Commit and push; Railway redeploys on `main`.

**Option B — UI + export**

Edit cells in the property table. Changes save to `localStorage` automatically. Use **Export JSON** to download the current state, then replace `public/data/portfolio.json` in the repo if you want that to become the new default.

**Reset** clears local edits and reloads from the repo file (with confirmation if local edits exist).

> Balances and loan terms live in the repo JSON. Use a **private repository** if those numbers are sensitive.

## Railway deployment

Same pattern as [bake-house](https://github.com/rao30/bake-house): a small Express server serves the built Vite app from `dist/`, and Railway auto-detects the Node project.

### One-time setup

1. In [Railway](https://railway.app/), create a **New Project → Deploy from GitHub repo**.
2. Select `portfolio-tracker` (works with private repos).
3. Railway runs `npm install`, `npm run build`, then `npm start` automatically.
4. Open the service **Settings → Networking → Generate Domain** for a public URL.

Every push to `main` triggers a new deploy — no GitHub Actions workflow or extra secrets required.

### How it works

| Phase | Command |
|-------|---------|
| Build | `npm run build` (TypeScript + Vite → `dist/`) |
| Start | `node server.js` (Express static server on `$PORT`) |

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
public/data/      Default portfolio JSON
server.js         Express server for Railway (serves dist/)
```

## License

Private use — see repository settings.
