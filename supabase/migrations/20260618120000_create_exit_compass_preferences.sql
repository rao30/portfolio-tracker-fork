-- Exit Compass: persisted UI preferences for hold/sell/1031 command center.

CREATE TABLE IF NOT EXISTS public.exit_compass_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  pinned_property text,
  analysis_mode text NOT NULL DEFAULT 'all',
  sell_at_month integer NOT NULL DEFAULT 12,
  closing_cost_pct numeric NOT NULL DEFAULT 0.06,
  capital_gains_rate numeric NOT NULL DEFAULT 0.15,
  recapture_rate numeric NOT NULL DEFAULT 0.25,
  hold_horizon_months integer NOT NULL DEFAULT 120,
  proceeds_to_debt_pct numeric NOT NULL DEFAULT 1.0,
  show_tax_breakdown boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exit_compass_pinned_property_valid
    CHECK (
      pinned_property IS NULL OR char_length(TRIM(BOTH FROM pinned_property)) > 0
    ),
  CONSTRAINT exit_compass_analysis_mode_valid
    CHECK (
      analysis_mode = ANY (ARRAY['hold'::text, 'sell'::text, 'exchange'::text, 'all'::text])
    ),
  CONSTRAINT exit_compass_sell_at_month_valid
    CHECK (sell_at_month >= 1 AND sell_at_month <= 360),
  CONSTRAINT exit_compass_closing_cost_valid
    CHECK (closing_cost_pct >= 0 AND closing_cost_pct <= 0.15),
  CONSTRAINT exit_compass_capital_gains_valid
    CHECK (capital_gains_rate >= 0 AND capital_gains_rate <= 0.40),
  CONSTRAINT exit_compass_recapture_valid
    CHECK (recapture_rate >= 0 AND recapture_rate <= 0.35),
  CONSTRAINT exit_compass_horizon_valid
    CHECK (hold_horizon_months >= 12 AND hold_horizon_months <= 360),
  CONSTRAINT exit_compass_proceeds_valid
    CHECK (proceeds_to_debt_pct >= 0 AND proceeds_to_debt_pct <= 1.0)
);

ALTER TABLE public.exit_compass_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY exit_compass_preferences_select_own ON public.exit_compass_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY exit_compass_preferences_insert_own ON public.exit_compass_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY exit_compass_preferences_update_own ON public.exit_compass_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY exit_compass_preferences_delete_own ON public.exit_compass_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.exit_compass_preferences IS
  'Per-user Exit Compass Command Center preferences (sell timing, tax assumptions, analysis mode).';
