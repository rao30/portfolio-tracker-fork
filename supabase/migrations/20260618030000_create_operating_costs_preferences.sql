-- Operating Costs Command Center: per-user expense editor preferences.

CREATE TABLE IF NOT EXISTS public.operating_costs_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  focused_property_index integer NOT NULL DEFAULT 0,
  show_schedule_e boolean NOT NULL DEFAULT true,
  entry_mode text NOT NULL DEFAULT 'breakdown',
  last_explored_preset text,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT operating_costs_focused_index_valid
    CHECK (focused_property_index >= 0 AND focused_property_index < 1000),
  CONSTRAINT operating_costs_entry_mode_valid
    CHECK (entry_mode = ANY (ARRAY['breakdown'::text, 'lump_sum'::text])),
  CONSTRAINT operating_costs_preset_valid
    CHECK (
      last_explored_preset IS NULL
      OR last_explored_preset = ANY (ARRAY[
        'lean_self_managed'::text,
        'typical'::text,
        'agency_managed'::text,
        'from_market_value'::text
      ])
    )
);

ALTER TABLE public.operating_costs_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY operating_costs_preferences_select_own ON public.operating_costs_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY operating_costs_preferences_insert_own ON public.operating_costs_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY operating_costs_preferences_update_own ON public.operating_costs_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY operating_costs_preferences_delete_own ON public.operating_costs_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.operating_costs_preferences IS
  'Per-user Operating Costs Command Center preferences (focus index, Schedule E view, preset memory).';
