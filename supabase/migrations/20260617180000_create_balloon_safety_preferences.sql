-- Balloon Safety Command Center: per-user UI preferences and watched properties.

CREATE TABLE IF NOT EXISTS public.balloon_safety_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  pinned_property text,
  show_cleared boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT balloon_safety_pinned_property_valid
    CHECK (
      pinned_property IS NULL OR char_length(TRIM(BOTH FROM pinned_property)) > 0
    )
);

ALTER TABLE public.balloon_safety_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY balloon_safety_preferences_select_own ON public.balloon_safety_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY balloon_safety_preferences_insert_own ON public.balloon_safety_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY balloon_safety_preferences_update_own ON public.balloon_safety_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY balloon_safety_preferences_delete_own ON public.balloon_safety_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.balloon_safety_preferences IS
  'Per-user Balloon Safety Command Center UI preferences.';
