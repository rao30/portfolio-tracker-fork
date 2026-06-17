-- Strategy Lab: persisted UI preferences for safe preview-then-apply pin switching.

CREATE TABLE IF NOT EXISTS public.strategy_lab_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  last_explored_pin_id uuid,
  committed_pin_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT strategy_lab_last_explored_pin_fk
    FOREIGN KEY (last_explored_pin_id)
    REFERENCES public.strategy_lab_scenarios(id)
    ON DELETE SET NULL,

  CONSTRAINT strategy_lab_committed_pin_fk
    FOREIGN KEY (committed_pin_id)
    REFERENCES public.strategy_lab_scenarios(id)
    ON DELETE SET NULL
);

ALTER TABLE public.strategy_lab_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategy_lab_preferences_select_own ON public.strategy_lab_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY strategy_lab_preferences_insert_own ON public.strategy_lab_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY strategy_lab_preferences_update_own ON public.strategy_lab_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY strategy_lab_preferences_delete_own ON public.strategy_lab_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.strategy_lab_preferences IS
  'Per-user Strategy Lab UI preferences (collapse state, preview/committed pin ids).';
