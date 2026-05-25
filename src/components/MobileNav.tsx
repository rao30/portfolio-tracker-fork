export type MobileTab = 'overview' | 'charts' | 'portfolio' | 'settings';

interface MobileNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'settings', label: 'Settings' },
];

export function MobileNav({ active, onChange }: MobileNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-7xl">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                isActive
                  ? 'text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span
                className={`h-0.5 w-8 rounded-full transition ${
                  isActive ? 'bg-cyan-400' : 'bg-transparent'
                }`}
                aria-hidden
              />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
