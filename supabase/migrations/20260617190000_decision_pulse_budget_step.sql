-- Decision Pulse: budget scrub step + defensive constraints for preview UX.

ALTER TABLE public.decision_pulse_preferences
  ADD COLUMN IF NOT EXISTS budget_step numeric NOT NULL DEFAULT 100;

ALTER TABLE public.decision_pulse_preferences
  DROP CONSTRAINT IF EXISTS decision_pulse_budget_step_valid;

ALTER TABLE public.decision_pulse_preferences
  ADD CONSTRAINT decision_pulse_budget_step_valid
    CHECK (budget_step >= 50 AND budget_step <= 5000);

COMMENT ON COLUMN public.decision_pulse_preferences.budget_step IS
  'Slider step size ($/mo) for Decision Pulse budget what-if scrubber.';
