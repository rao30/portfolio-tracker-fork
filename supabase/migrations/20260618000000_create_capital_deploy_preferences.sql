-- Capital Deploy Command Center: per-user preferences for capital allocation lane analysis.

CREATE TABLE IF NOT EXISTS public.capital_deploy_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  target_reserve_months integer NOT NULL DEFAULT 6,
  acquisition_coc_hurdle numeric NOT NULL DEFAULT 0.08,
  last_explored_deploy_amount numeric,
  pinned_lane text,
  deploy_step numeric NOT NULL DEFAULT 100,
  show_lane_comparison boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT capital_deploy_target_reserve_valid
    CHECK (target_reserve_months >= 1 AND target_reserve_months <= 24),
  CONSTRAINT capital_deploy_coc_hurdle_valid
    CHECK (acquisition_coc_hurdle >= 0 AND acquisition_coc_hurdle <= 0.50),
  CONSTRAINT capital_deploy_last_explored_valid
    CHECK (
      last_explored_deploy_amount IS NULL
      OR (last_explored_deploy_amount >= 0 AND last_explored_deploy_amount <= 1000000)
    ),
  CONSTRAINT capital_deploy_pinned_lane_valid
    CHECK (
      pinned_lane IS NULL
      OR pinned_lane = ANY (ARRAY['paydown'::text, 'reserve'::text, 'acquisition'::text])
    ),
  CONSTRAINT capital_deploy_step_valid
    CHECK (deploy_step >= 50 AND deploy_step <= 5000)
);

ALTER TABLE public.capital_deploy_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY capital_deploy_preferences_select_own ON public.capital_deploy_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY capital_deploy_preferences_insert_own ON public.capital_deploy_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY capital_deploy_preferences_update_own ON public.capital_deploy_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY capital_deploy_preferences_delete_own ON public.capital_deploy_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.capital_deploy_preferences IS
  'Per-user Capital Deploy Command Center preferences (reserve target, acquisition hurdle, lane pin).';
