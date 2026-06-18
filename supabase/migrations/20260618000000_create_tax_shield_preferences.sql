-- Tax Shield Command Center: persisted UI preferences for safe-preview tax modeling.

CREATE TABLE IF NOT EXISTS public.tax_shield_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  last_explored_w2_income numeric,
  last_explored_carryover numeric,
  income_step numeric NOT NULL DEFAULT 10000,
  show_property_breakdown boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tax_shield_last_explored_w2_valid
    CHECK (
      last_explored_w2_income IS NULL OR (
        last_explored_w2_income >= 0 AND last_explored_w2_income <= 10000000
      )
    ),
  CONSTRAINT tax_shield_last_explored_carryover_valid
    CHECK (
      last_explored_carryover IS NULL OR (
        last_explored_carryover >= 0 AND last_explored_carryover <= 10000000
      )
    ),
  CONSTRAINT tax_shield_income_step_valid
    CHECK (income_step >= 1000 AND income_step <= 100000)
);

ALTER TABLE public.tax_shield_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_shield_preferences_select_own ON public.tax_shield_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY tax_shield_preferences_insert_own ON public.tax_shield_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY tax_shield_preferences_update_own ON public.tax_shield_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY tax_shield_preferences_delete_own ON public.tax_shield_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.tax_shield_preferences IS
  'Per-user Tax Shield Command Center UI preferences (collapse, income scrubber step, last explored values).';
