# AGENTS.md

## Cursor Cloud specific instructions

Rental Snowball is a single Node.js (>=20) product: a React/Vite SPA dashboard plus an Express API server (`server.js`) that also exposes an MCP endpoint. Standard scripts live in `package.json`; setup is just `npm install` (handled by the startup update script).

### Running (development)
- `npm run dev:all` runs both services together: Vite on **5173** and Express API on **3000** (Vite proxies `/api` → `:3000`). Use `npm run dev` (Vite only) or `npm run dev:server` (API only) for a single service.
- The dashboard lives at the **`/app`** route (e.g. `http://localhost:5173/app`). The root path `/` is a marketing/landing page, not the dashboard — navigate to `/app` to reach the simulator.
- The app runs fully standalone in "demo mode": without `SUPABASE_URL`/`SUPABASE_*` keys it loads the seed `public/data/portfolio.json` and uses browser `localStorage`. Cloud persistence, Supabase auth, MCP remote access, and RentCast market-value refresh are all optional add-ons that need external credentials. Check wiring via `GET /api/health`.
- Protected API endpoints (`GET /api/portfolio`, `POST /api/analyze`, writes) require `PORTFOLIO_API_KEY` when it is set (it is provided as an env secret here). Send it as `Authorization: Bearer $PORTFOLIO_API_KEY` or header `X-Portfolio-Key`. The browser SPA reads the seed JSON directly from Vite (`/data/portfolio.json`), so the dashboard works without the key.

### Production
- `npm start` (`node server.js`) serves the built SPA from `dist/` and exits with an error if `dist/index.html` is missing — always run `npm run build` first. Prefer `npm run dev:all` during development.

### Tests / typecheck / build
- `npm test` (Vitest) — all unit tests pass.
- `npm run build` (esbuild analytics → Vite build → esbuild MCP) succeeds.
- `npm run typecheck` (`tsc -b`) and therefore `npm run check` currently FAIL due to pre-existing TypeScript errors in source/test files. This is unrelated to environment setup. The runtime build does not use `tsc` (it uses Vite/esbuild), so the app builds and runs despite these type errors.
