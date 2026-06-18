-- Seller Financing Command Center: per-user UI preferences and note-structure presets.

CREATE TABLE IF NOT EXISTS public.seller_financing_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  focused_property_index integer NOT NULL DEFAULT 0
    CHECK (focused_property_index >= 0 AND focused_property_index < 1000),
  entry_mode text NOT NULL DEFAULT 'cap_driven'
    CHECK (entry_mode = ANY (ARRAY['cap_driven'::text, 'balance_driven'::text])),
  last_explored_preset text
    CHECK (
      last_explored_preset IS NULL OR
      last_explored_preset = ANY (ARRAY[
        'yield_maintenance_5yr'::text,
        'yield_maintenance_7yr'::text,
        'short_balloon_3yr'::text,
        'long_balloon_10yr'::text
      ])
    ),
  show_amortization_chart boolean NOT NULL DEFAULT true,
  show_refi_impact boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_financing_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY seller_financing_preferences_select_own ON public.seller_financing_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY seller_financing_preferences_insert_own ON public.seller_financing_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY seller_financing_preferences_update_own ON public.seller_financing_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY seller_financing_preferences_delete_own ON public.seller_financing_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.seller_financing_preferences IS
  'Per-user Seller Financing Command Center preferences (entry mode, presets, focus).';
