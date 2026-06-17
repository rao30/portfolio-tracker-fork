-- Saved property lifecycle timeline plans (rent changes, refis, capex, dispositions).
CREATE TABLE portfolio_timeline_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  property_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenario_config jsonb,
  color text NOT NULL DEFAULT '#06b6d4',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT portfolio_timeline_scenarios_name_trim
    CHECK (name = trim(name)),
  CONSTRAINT portfolio_timeline_scenarios_name_length
    CHECK (char_length(name) >= 1 AND char_length(name) <= 120),
  CONSTRAINT portfolio_timeline_scenarios_description_length
    CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT portfolio_timeline_scenarios_property_events_array
    CHECK (jsonb_typeof(property_events) = 'array'),
  CONSTRAINT portfolio_timeline_scenarios_color_format
    CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT portfolio_timeline_scenarios_sort_order_range
    CHECK (sort_order >= 0 AND sort_order <= 1000)
);

CREATE INDEX portfolio_timeline_scenarios_user_id_idx
  ON portfolio_timeline_scenarios (user_id);

CREATE UNIQUE INDEX portfolio_timeline_scenarios_user_name_lower_idx
  ON portfolio_timeline_scenarios (user_id, lower(name));

COMMENT ON TABLE portfolio_timeline_scenarios IS
  'Named portfolio lifecycle what-if plans with per-property timeline events';

ALTER TABLE portfolio_timeline_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY portfolio_timeline_scenarios_select_own ON portfolio_timeline_scenarios
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY portfolio_timeline_scenarios_insert_own ON portfolio_timeline_scenarios
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY portfolio_timeline_scenarios_update_own ON portfolio_timeline_scenarios
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY portfolio_timeline_scenarios_delete_own ON portfolio_timeline_scenarios
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
