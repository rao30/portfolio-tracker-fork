import type { DataSource, SyncStatus } from '../lib/usePortfolio';

interface HeaderProps {
  source: DataSource;
  syncStatus: SyncStatus;
  cloudEnabled: boolean;
  isDirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  onReset: () => void;
  onExport: () => void;
  onScheduleOfRealEstate?: () => void;
  onRefreshMarketValues?: () => void;
  marketValuesRefreshing?: boolean;
  onSignOut?: () => void;
  userEmail?: string | null;
  compact?: boolean;
}

function syncLabel(
  syncStatus: SyncStatus,
  cloudEnabled: boolean,
  isDirty: boolean,
): string | null {
  if (isDirty) return 'Unsaved changes';
  if (!cloudEnabled) return null;
  switch (syncStatus) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    default:
      return null;
  }
}

export function Header({
  source,
  syncStatus,
  cloudEnabled,
  isDirty = false,
  saving = false,
  onSave,
  onDiscard,
  onReset,
  onExport,
  onScheduleOfRealEstate,
  onRefreshMarketValues,
  marketValuesRefreshing = false,
  onSignOut,
  userEmail,
  compact = false,
}: HeaderProps) {
  const sync = syncLabel(syncStatus, cloudEnabled, isDirty);

  const saveButton =
    onSave && isDirty ? (
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    ) : null;

  const discardButton =
    onDiscard && isDirty ? (
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
      >
        Discard
      </button>
    ) : null;

  const statusBadge = sync ? (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        isDirty
          ? 'bg-amber-500/20 text-amber-300'
          : syncStatus === 'error'
            ? 'bg-red-500/20 text-red-300'
            : syncStatus === 'saving'
              ? 'bg-slate-500/20 text-slate-300'
              : 'bg-emerald-500/20 text-emerald-300'
      }`}
    >
      {sync}
    </span>
  ) : null;

  if (compact) {
    return (
      <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-white">
            Rental Snowball
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">Payoff simulation</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {statusBadge ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isDirty
                  ? 'bg-amber-500/20 text-amber-300'
                  : syncStatus === 'error'
                    ? 'bg-red-500/20 text-red-300'
                    : syncStatus === 'saving'
                      ? 'bg-slate-500/20 text-slate-300'
                      : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {sync}
            </span>
          ) : null}
          {saveButton ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-cyan-600 px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
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
        {statusBadge}
        {discardButton}
        {saveButton}
        <button
          type="button"
          onClick={onReset}
          title={
            source === 'cloud' || source === 'local'
              ? 'Restore the original portfolio template'
              : undefined
          }
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Reset to defaults
        </button>
        {onScheduleOfRealEstate ? (
          <button
            type="button"
            onClick={onScheduleOfRealEstate}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Schedule of Real Estate
          </button>
        ) : null}
        {onRefreshMarketValues ? (
          <button
            type="button"
            onClick={onRefreshMarketValues}
            disabled={marketValuesRefreshing}
            title="Refresh property values from current market estimates"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {marketValuesRefreshing ? 'Updating values…' : 'Update values'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExport}
          className="rounded-lg border border-cyan-500/30 bg-cyan-600/20 px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-600/30"
        >
          Export
        </button>
        {userEmail ? (
          <span className="hidden text-xs text-slate-500 sm:inline">{userEmail}</span>
        ) : null}
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
