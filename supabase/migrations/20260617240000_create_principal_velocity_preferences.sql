-- Principal Velocity Command Center: per-user UI preferences for wealth-building paydown analytics.

CREATE TABLE IF NOT EXISTS public.principal_velocity_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  view_mode text NOT NULL DEFAULT 'monthly',
  horizon_months integer NOT NULL DEFAULT 120,
  show_baseline_comparison boolean NOT NULL DEFAULT true,
  pinned_property text,
  last_explored_budget numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT principal_velocity_view_mode_valid
    CHECK (view_mode = ANY (ARRAY['monthly'::text, 'cumulative'::text, 'stacked'::text])),
  CONSTRAINT principal_velocity_horizon_months_valid
    CHECK (horizon_months >= 12 AND horizon_months <= 360),
  CONSTRAINT principal_velocity_pinned_property_valid
    CHECK (
      pinned_property IS NULL OR char_length(TRIM(BOTH FROM pinned_property)) > 0
    ),
  CONSTRAINT principal_velocity_last_explored_budget_valid
    CHECK (
      last_explored_budget IS NULL OR (
        last_explored_budget >= 0 AND last_explored_budget <= 1000000
      )
    )
);

ALTER TABLE public.principal_velocity_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY principal_velocity_preferences_select_own ON public.principal_velocity_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY principal_velocity_preferences_insert_own ON public.principal_velocity_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY principal_velocity_preferences_update_own ON public.principal_velocity_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY principal_velocity_preferences_delete_own ON public.principal_velocity_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.principal_velocity_preferences IS
  'Per-user Principal Velocity Command Center preferences (view mode, horizon, baseline toggle, budget preview).';
