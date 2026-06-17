-- Timeline Command Center: persisted UI preferences for safe-preview lifecycle planning.

CREATE TABLE IF NOT EXISTS public.timeline_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  focused_property_index integer NOT NULL DEFAULT 0,
  last_explored_plan_id uuid,
  show_committed_ghost boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT timeline_focused_property_index_valid
    CHECK (focused_property_index >= 0 AND focused_property_index < 1000),
  CONSTRAINT timeline_last_explored_plan_fk
    FOREIGN KEY (last_explored_plan_id)
    REFERENCES public.portfolio_timeline_scenarios(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS timeline_preferences_last_plan_idx
  ON public.timeline_preferences (last_explored_plan_id)
  WHERE last_explored_plan_id IS NOT NULL;

ALTER TABLE public.timeline_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY timeline_preferences_select_own ON public.timeline_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY timeline_preferences_insert_own ON public.timeline_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY timeline_preferences_update_own ON public.timeline_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY timeline_preferences_delete_own ON public.timeline_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.timeline_preferences IS
  'Per-user Timeline Command Center UI preferences (collapse, focus lane, last explored plan).';
