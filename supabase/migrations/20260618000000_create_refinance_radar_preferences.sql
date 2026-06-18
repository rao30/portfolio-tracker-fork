-- Refinance Radar Command Center: per-user refi assumption preferences and UI state.

CREATE TABLE IF NOT EXISTS public.refinance_radar_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  pinned_property text,
  analysis_mode text NOT NULL DEFAULT 'both',
  market_rate numeric NOT NULL DEFAULT 0.07,
  closing_cost_pct numeric NOT NULL DEFAULT 0.025,
  hold_period_months integer NOT NULL DEFAULT 60,
  cash_out_ltv numeric NOT NULL DEFAULT 0.75,
  min_dscr numeric NOT NULL DEFAULT 1.0,
  deployment_yield numeric NOT NULL DEFAULT 0.12,
  refi_term_months integer NOT NULL DEFAULT 360,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refinance_radar_pinned_property_valid
    CHECK (
      pinned_property IS NULL OR char_length(TRIM(BOTH FROM pinned_property)) > 0
    ),
  CONSTRAINT refinance_radar_analysis_mode_valid
    CHECK (analysis_mode = ANY (ARRAY['rate_term'::text, 'cash_out'::text, 'both'::text])),
  CONSTRAINT refinance_radar_market_rate_range
    CHECK (market_rate >= 0.01 AND market_rate <= 0.20),
  CONSTRAINT refinance_radar_closing_cost_range
    CHECK (closing_cost_pct >= 0 AND closing_cost_pct <= 0.10),
  CONSTRAINT refinance_radar_hold_period_range
    CHECK (hold_period_months >= 12 AND hold_period_months <= 360),
  CONSTRAINT refinance_radar_cash_out_ltv_range
    CHECK (cash_out_ltv >= 0.50 AND cash_out_ltv <= 0.85),
  CONSTRAINT refinance_radar_min_dscr_range
    CHECK (min_dscr >= 0.50 AND min_dscr <= 2.0),
  CONSTRAINT refinance_radar_deployment_yield_range
    CHECK (deployment_yield >= 0 AND deployment_yield <= 0.50),
  CONSTRAINT refinance_radar_term_range
    CHECK (refi_term_months >= 60 AND refi_term_months <= 480)
);

ALTER TABLE public.refinance_radar_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY refinance_radar_preferences_select_own ON public.refinance_radar_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY refinance_radar_preferences_insert_own ON public.refinance_radar_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY refinance_radar_preferences_update_own ON public.refinance_radar_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY refinance_radar_preferences_delete_own ON public.refinance_radar_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.refinance_radar_preferences IS
  'Per-user Refinance Radar Command Center preferences (market assumptions, analysis mode, collapse state).';
