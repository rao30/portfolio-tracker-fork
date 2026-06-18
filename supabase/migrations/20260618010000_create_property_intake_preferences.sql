-- Property Intake Command Center: persisted wizard preferences per user.

CREATE TABLE IF NOT EXISTS public.property_intake_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  preferred_template text NOT NULL DEFAULT 'clone_last',
  default_financing_type text NOT NULL DEFAULT 'conventional',
  last_completed_step text NOT NULL DEFAULT 'template',
  auto_calculate_payment boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT property_intake_preferred_template_valid
    CHECK (preferred_template = ANY (ARRAY['clone_last', 'acquisition', 'blank'])),
  CONSTRAINT property_intake_financing_type_valid
    CHECK (default_financing_type = ANY (ARRAY['conventional', 'seller'])),
  CONSTRAINT property_intake_last_step_valid
    CHECK (last_completed_step = ANY (ARRAY[
      'template', 'identity', 'loan', 'income', 'review'
    ]))
);

ALTER TABLE public.property_intake_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_intake_preferences_select_own ON public.property_intake_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY property_intake_preferences_insert_own ON public.property_intake_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY property_intake_preferences_update_own ON public.property_intake_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY property_intake_preferences_delete_own ON public.property_intake_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.property_intake_preferences IS
  'Per-user Property Intake Command Center wizard preferences (template source, financing default, step memory).';
