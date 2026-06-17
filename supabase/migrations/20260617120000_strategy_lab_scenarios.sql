-- Extend existing strategy_lab_scenarios with full what-if payload (scenario JSON).
-- Reuses sort_order (1–9) as keyboard slot; is_pinned marks active lab pins.

ALTER TABLE strategy_lab_scenarios
  ADD COLUMN IF NOT EXISTS scenario jsonb;

ALTER TABLE strategy_lab_scenarios
  DROP CONSTRAINT IF EXISTS strategy_lab_scenarios_scenario_is_object;

ALTER TABLE strategy_lab_scenarios
  ADD CONSTRAINT strategy_lab_scenarios_scenario_is_object
  CHECK (scenario IS NULL OR jsonb_typeof(scenario) = 'object');

-- Tighten sort_order to keyboard slots when used as Strategy Lab pins.
ALTER TABLE strategy_lab_scenarios
  DROP CONSTRAINT IF EXISTS strategy_lab_scenarios_sort_order_range;

ALTER TABLE strategy_lab_scenarios
  ADD CONSTRAINT strategy_lab_scenarios_sort_order_range
  CHECK (sort_order >= 1 AND sort_order <= 9);

CREATE UNIQUE INDEX IF NOT EXISTS strategy_lab_scenarios_user_slot_idx
  ON strategy_lab_scenarios (user_id, sort_order)
  WHERE is_pinned = true;

COMMENT ON COLUMN strategy_lab_scenarios.scenario IS
  'Pinned ScenarioConfig JSON for Strategy Lab keyboard slots 1–9';
