import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <div>
          <p className="text-lg font-bold tracking-tight text-white">Rental Snowball</p>
          <p className="text-xs text-slate-500">Portfolio payoff simulation</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/login"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            Create account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="glass-card max-w-3xl p-8 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Model your rental portfolio payoff strategy
          </h1>
          <p className="mt-4 text-base text-slate-400 sm:text-lg">
            Compare avalanche, snowball, and cashflow strategies across your properties. Track
            equity, DSCR, tax impacts, and a Schedule of Real Estate — saved to your account.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li>• Multi-property snowball simulation with monthly granularity</li>
            <li>• Strategy Lab — pin and compare budget + payoff combos side by side</li>
            <li>• Seller financing, refi balloons, and house-hack scenarios</li>
            <li>• Tax planner with cost seg and bonus depreciation</li>
            <li>• Private portfolio — your data stays yours</li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500"
            >
              Get started free
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-slate-200 hover:bg-white/5"
            >
              I already have an account
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-600">
          Financial projections only — not investment advice.
        </p>
      </main>
    </div>
  );
}
