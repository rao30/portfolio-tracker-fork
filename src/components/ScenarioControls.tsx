import { useMemo, useState } from 'react';
import type { Portfolio, ScenarioConfig } from '../lib/types';
import { SCENARIO_PRESETS, buildSellScenario } from '../lib/snowball';
import { formatPercent } from '../lib/format';

interface ScenarioControlsProps {
  portfolio: Portfolio;
  scenarioId: string;
  onScenarioChange: (scenario: ScenarioConfig) => void;
  embedded?: boolean;
}

const CUSTOM_ID = 'custom';

export function ScenarioControls({
  portfolio,
  scenarioId,
  onScenarioChange,
  embedded = false,
}: ScenarioControlsProps) {
  const sellScenarios = portfolio.properties.map((p) => buildSellScenario(p.name));
  const allPresets = [...SCENARIO_PRESETS, ...sellScenarios];

  const [customOpen, setCustomOpen] = useState(scenarioId === CUSTOM_ID);
  const [customVacancy, setCustomVacancy] = useState(0.05);
  const [customCapex, setCustomCapex] = useState(0.1);
  const [customRateShock, setCustomRateShock] = useState(0);
  const [customPause, setCustomPause] = useState(0);
  const customScenario: ScenarioConfig = useMemo(
    () => ({
      id: CUSTOM_ID,
      label: 'Custom scenario',
      vacancyRate: customVacancy,
      capexReserveRate: customCapex,
      rateShock: customRateShock,
      pauseExtraMonths: customPause,
    }),
    [customVacancy, customCapex, customRateShock, customPause],
  );

  return (
    <div className={embedded ? 'space-y-3' : 'glass-card space-y-3 p-4'}>
      <label
        htmlFor="scenario-select"
        className="block text-sm font-medium text-slate-300"
      >
        What-if scenario
      </label>
      <select
        id="scenario-select"
        value={scenarioId.startsWith('sell-') || scenarioId === CUSTOM_ID ? scenarioId : scenarioId}
        onChange={(e) => {
          const id = e.target.value;
          if (id === CUSTOM_ID) {
            setCustomOpen(true);
            onScenarioChange(customScenario);
            return;
          }
          setCustomOpen(false);
          const selected =
            allPresets.find((s) => s.id === id) ?? SCENARIO_PRESETS[0];
          onScenarioChange(selected);
        }}
        className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
      >
        {SCENARIO_PRESETS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
        <option value={CUSTOM_ID}>Custom…</option>
        <optgroup label="Sell property">
          {sellScenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </optgroup>
      </select>

      {(customOpen || scenarioId === CUSTOM_ID) && (
        <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Vacancy {formatPercent(customVacancy)}
            </label>
            <input
              type="range"
              min={0}
              max={0.25}
              step={0.01}
              value={customVacancy}
              onChange={(e) => {
                setCustomVacancy(Number(e.target.value));
                onScenarioChange({ ...customScenario, vacancyRate: Number(e.target.value) });
              }}
              className="h-2 w-full accent-cyan-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Capex override {formatPercent(customCapex)}
            </label>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.005}
              value={customCapex}
              onChange={(e) => {
                setCustomCapex(Number(e.target.value));
                onScenarioChange({ ...customScenario, capexReserveRate: Number(e.target.value) });
              }}
              className="h-2 w-full accent-cyan-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Rate shock {formatPercent(customRateShock)}
            </label>
            <input
              type="range"
              min={0}
              max={0.03}
              step={0.005}
              value={customRateShock}
              onChange={(e) => {
                setCustomRateShock(Number(e.target.value));
                onScenarioChange({ ...customScenario, rateShock: Number(e.target.value) });
              }}
              className="h-2 w-full accent-cyan-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Pause extra payments (months)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={customPause}
              onChange={(e) => {
                setCustomPause(Number(e.target.value) || 0);
                onScenarioChange({
                  ...customScenario,
                  pauseExtraMonths: Number(e.target.value) || 0,
                });
              }}
              className="w-full rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-sm text-slate-100"
            />
          </div>
        </div>
      )}

      {scenarioId !== 'base' && (
        <p className="text-xs text-slate-400">
          Comparing scenario vs base case on net worth chart.
        </p>
      )}
    </div>
  );
}
