-- Mobile Mission Control: persisted layout preferences for the unified mobile overview.

CREATE TABLE IF NOT EXISTS public.mobile_mission_control_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_module text NOT NULL DEFAULT 'pulse',
  collapsed_modules text[] NOT NULL DEFAULT '{}',
  show_hero_strip boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mobile_mission_control_active_module_valid
    CHECK (active_module = ANY (ARRAY[
      'pulse', 'assumptions', 'balloon', 'landscape', 'stress',
      'timeline', 'velocity', 'snapshot', 'playbook', 'lab', 'goals'
    ])),
  CONSTRAINT mobile_mission_control_collapsed_modules_valid
    CHECK (
      collapsed_modules <@ ARRAY[
        'pulse', 'assumptions', 'balloon', 'landscape', 'stress',
        'timeline', 'velocity', 'snapshot', 'playbook', 'lab', 'goals'
      ]::text[]
    )
);

ALTER TABLE public.mobile_mission_control_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY mobile_mission_control_preferences_select_own
  ON public.mobile_mission_control_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY mobile_mission_control_preferences_insert_own
  ON public.mobile_mission_control_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY mobile_mission_control_preferences_update_own
  ON public.mobile_mission_control_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY mobile_mission_control_preferences_delete_own
  ON public.mobile_mission_control_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.mobile_mission_control_preferences IS
  'Per-user Mobile Mission Control layout (active accordion module, collapsed state, hero strip).';
