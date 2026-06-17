-- Property Deck mobile: persist swipe-navigation onboarding dismissal.

ALTER TABLE public.property_deck_preferences
  ADD COLUMN IF NOT EXISTS mobile_hint_dismissed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.property_deck_preferences.mobile_hint_dismissed IS
  'True after user dismisses the mobile swipe-navigation hint in Property Deck.';
