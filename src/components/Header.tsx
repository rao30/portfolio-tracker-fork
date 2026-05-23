import type { DataSource } from '../lib/usePortfolio';

interface HeaderProps {
  source: DataSource;
  onReset: () => void;
  onExport: () => void;
}

export function Header({ source, onReset, onExport }: HeaderProps) {
  return (
    <header className="glass-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Rental Snowball
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Aggressive payoff simulation across your rental portfolio
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            source === 'local'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-cyan-500/20 text-cyan-300'
          }`}
        >
          {source === 'local' ? 'Local edits active' : 'Loaded from repo'}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onExport}
          className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-cyan-500"
        >
          Export JSON
        </button>
      </div>
    </header>
  );
}
