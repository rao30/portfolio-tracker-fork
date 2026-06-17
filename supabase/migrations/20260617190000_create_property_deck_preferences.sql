-- Property Deck: persisted UI preferences for the focus-mode property editor.

CREATE TABLE IF NOT EXISTS public.property_deck_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  view_mode text NOT NULL DEFAULT 'deck',
  focused_index integer NOT NULL DEFAULT 0,
  inspector_tab text NOT NULL DEFAULT 'core',
  financing_filter text NOT NULL DEFAULT 'all',
  search_query text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT property_deck_view_mode_valid
    CHECK (view_mode IN ('deck', 'table')),
  CONSTRAINT property_deck_focused_index_valid
    CHECK (focused_index >= 0 AND focused_index < 1000),
  CONSTRAINT property_deck_inspector_tab_valid
    CHECK (inspector_tab IN ('core', 'financing', 'expenses', 'advanced')),
  CONSTRAINT property_deck_financing_filter_valid
    CHECK (financing_filter IN ('all', 'seller', 'conventional')),
  CONSTRAINT property_deck_search_query_length
    CHECK (char_length(search_query) <= 200)
);

ALTER TABLE public.property_deck_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_deck_preferences_select_own ON public.property_deck_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY property_deck_preferences_insert_own ON public.property_deck_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY property_deck_preferences_update_own ON public.property_deck_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY property_deck_preferences_delete_own ON public.property_deck_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.property_deck_preferences IS
  'Per-user Property Deck UI preferences (view mode, focus index, inspector tab).';
