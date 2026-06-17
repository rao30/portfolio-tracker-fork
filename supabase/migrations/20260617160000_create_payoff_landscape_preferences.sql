-- Payoff Landscape: persisted viewport for the strategy × budget heatmap.

CREATE TABLE IF NOT EXISTS public.payoff_landscape_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  metric text NOT NULL DEFAULT 'monthsToPayoff',
  budget_min numeric NOT NULL DEFAULT 0,
  budget_max numeric NOT NULL DEFAULT 5000,
  budget_step numeric NOT NULL DEFAULT 500,
  is_collapsed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payoff_landscape_metric_valid
    CHECK (metric = ANY (ARRAY['monthsToPayoff', 'totalInterest', 'interestSaved'])),
  CONSTRAINT payoff_landscape_budget_min_valid
    CHECK (budget_min >= 0 AND budget_min <= 1000000),
  CONSTRAINT payoff_landscape_budget_max_valid
    CHECK (budget_max > budget_min AND budget_max <= 1000000),
  CONSTRAINT payoff_landscape_budget_step_valid
    CHECK (budget_step >= 100 AND budget_step <= 5000)
);

ALTER TABLE public.payoff_landscape_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY payoff_landscape_preferences_select_own ON public.payoff_landscape_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY payoff_landscape_preferences_insert_own ON public.payoff_landscape_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY payoff_landscape_preferences_update_own ON public.payoff_landscape_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY payoff_landscape_preferences_delete_own ON public.payoff_landscape_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.payoff_landscape_preferences IS
  'Per-user Payoff Landscape heatmap viewport (metric, budget range, collapse state).';
