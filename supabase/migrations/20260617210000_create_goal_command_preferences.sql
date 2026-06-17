-- Freedom Date Command Center: per-user goal UI preferences and validated targets.

CREATE TABLE IF NOT EXISTS public.goal_command_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  active_goal_type text NOT NULL DEFAULT 'debtFree',
  debt_free_target_month integer NOT NULL DEFAULT 180,
  equity_target_month integer NOT NULL DEFAULT 180,
  equity_target_value numeric NOT NULL DEFAULT 2000000,
  last_explored_budget numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT goal_command_active_goal_type_valid
    CHECK (active_goal_type = ANY (ARRAY['debtFree'::text, 'equity'::text])),
  CONSTRAINT goal_command_debt_free_target_month_valid
    CHECK (debt_free_target_month >= 12 AND debt_free_target_month <= 600),
  CONSTRAINT goal_command_equity_target_month_valid
    CHECK (equity_target_month >= 12 AND equity_target_month <= 600),
  CONSTRAINT goal_command_equity_target_value_valid
    CHECK (equity_target_value >= 100000 AND equity_target_value <= 1000000000),
  CONSTRAINT goal_command_last_explored_budget_valid
    CHECK (
      last_explored_budget IS NULL OR (
        last_explored_budget >= 0 AND last_explored_budget <= 1000000
      )
    )
);

ALTER TABLE public.goal_command_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_command_preferences_select_own ON public.goal_command_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY goal_command_preferences_insert_own ON public.goal_command_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY goal_command_preferences_update_own ON public.goal_command_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY goal_command_preferences_delete_own ON public.goal_command_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.goal_command_preferences IS
  'Per-user Freedom Date Command Center preferences (collapse, targets, last explored budget).';
