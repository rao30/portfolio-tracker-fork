import type { DataSource, SyncStatus } from '../lib/usePortfolio';

interface HeaderProps {
  source: DataSource;
  syncStatus: SyncStatus;
  cloudEnabled: boolean;
  onReset: () => void;
  onExport: () => void;
  compact?: boolean;
}

function sourceLabel(source: DataSource): string {
  switch (source) {
    case 'cloud':
      return 'Cloud';
    case 'local':
      return 'Local';
    default:
      return 'Defaults';
  }
}

function sourceBadgeClass(source: DataSource): string {
  switch (source) {
    case 'cloud':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'local':
      return 'bg-amber-500/20 text-amber-300';
    default:
      return 'bg-cyan-500/20 text-cyan-300';
  }
}

function syncLabel(syncStatus: SyncStatus, cloudEnabled: boolean): string | null {
  if (!cloudEnabled) return null;
  switch (syncStatus) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Failed';
    default:
      return null;
  }
}

export function Header({
  source,
  syncStatus,
  cloudEnabled,
  onReset,
  onExport,
  compact = false,
}: HeaderProps) {
  const sync = syncLabel(syncStatus, cloudEnabled);

  if (compact) {
    return (
      <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-white">
            Rental Snowball
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Payoff simulation
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceBadgeClass(source)}`}
          >
            {sourceLabel(source)}
          </span>
          {sync ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                syncStatus === 'error'
                  ? 'bg-red-500/20 text-red-300'
                  : syncStatus === 'saving'
                    ? 'bg-slate-500/20 text-slate-300'
                    : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {sync}
            </span>
          ) : null}
        </div>
      </header>
    );
  }

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
          className={`rounded-full px-3 py-1 text-xs font-medium ${sourceBadgeClass(source)}`}
        >
          {source === 'cloud'
            ? 'Synced to cloud'
            : source === 'local'
              ? 'Local edits (browser cache)'
              : 'Loaded from repo defaults'}
        </span>
        {sync ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              syncStatus === 'error'
                ? 'bg-red-500/20 text-red-300'
                : syncStatus === 'saving'
                  ? 'bg-slate-500/20 text-slate-300'
                  : 'bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {sync}
          </span>
        ) : null}
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
