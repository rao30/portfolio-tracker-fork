import type { Portfolio, ScenarioConfig } from '../lib/types';
import { SCENARIO_PRESETS, buildSellScenario } from '../lib/snowball';

interface ScenarioControlsProps {
  portfolio: Portfolio;
  scenarioId: string;
  onScenarioChange: (scenario: ScenarioConfig) => void;
}

export function ScenarioControls({
  portfolio,
  scenarioId,
  onScenarioChange,
}: ScenarioControlsProps) {
  const sellScenarios = portfolio.properties.map((p) => buildSellScenario(p.name));
  const allScenarios = [...SCENARIO_PRESETS, ...sellScenarios];

  return (
    <div className="glass-card p-4">
      <label
        htmlFor="scenario-select"
        className="mb-2 block text-sm font-medium text-slate-300"
      >
        What-if scenario
      </label>
      <select
        id="scenario-select"
        value={scenarioId}
        onChange={(e) => {
          const selected =
            allScenarios.find((s) => s.id === e.target.value) ??
            SCENARIO_PRESETS[0];
          onScenarioChange(selected);
        }}
        className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
      >
        {SCENARIO_PRESETS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
        <optgroup label="Sell property">
          {sellScenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </optgroup>
      </select>
      {scenarioId !== 'base' && (
        <p className="mt-2 text-xs text-slate-400">
          Comparing scenario vs base case on net worth chart.
        </p>
      )}
    </div>
  );
}
