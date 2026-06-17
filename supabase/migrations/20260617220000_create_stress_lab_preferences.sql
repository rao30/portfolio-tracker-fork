-- Stress Lab: persisted UI preferences for the scenario stress-test command center.

CREATE TABLE IF NOT EXISTS public.stress_lab_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  last_explored_scenario_id text,
  pinned_preset_id text,
  show_sell_scenarios boolean NOT NULL DEFAULT false,
  custom_vacancy numeric NOT NULL DEFAULT 0.05,
  custom_capex numeric NOT NULL DEFAULT 0.1,
  custom_rate_shock numeric NOT NULL DEFAULT 0,
  custom_pause_months integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stress_lab_last_explored_valid
    CHECK (
      last_explored_scenario_id IS NULL OR char_length(TRIM(BOTH FROM last_explored_scenario_id)) > 0
    ),
  CONSTRAINT stress_lab_pinned_preset_valid
    CHECK (
      pinned_preset_id IS NULL OR char_length(TRIM(BOTH FROM pinned_preset_id)) > 0
    ),
  CONSTRAINT stress_lab_custom_vacancy_valid
    CHECK (custom_vacancy >= 0 AND custom_vacancy <= 0.5),
  CONSTRAINT stress_lab_custom_capex_valid
    CHECK (custom_capex >= 0 AND custom_capex <= 0.5),
  CONSTRAINT stress_lab_custom_rate_shock_valid
    CHECK (custom_rate_shock >= 0 AND custom_rate_shock <= 0.1),
  CONSTRAINT stress_lab_custom_pause_valid
    CHECK (custom_pause_months >= 0 AND custom_pause_months <= 120)
);

ALTER TABLE public.stress_lab_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY stress_lab_preferences_select_own ON public.stress_lab_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY stress_lab_preferences_insert_own ON public.stress_lab_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY stress_lab_preferences_update_own ON public.stress_lab_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY stress_lab_preferences_delete_own ON public.stress_lab_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.stress_lab_preferences IS
  'Per-user Stress Lab UI preferences (collapse, custom knobs, last explored scenario).';
