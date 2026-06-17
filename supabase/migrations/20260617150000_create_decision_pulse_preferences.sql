-- Decision Pulse: persisted UI preferences for the payoff command center.

CREATE TABLE IF NOT EXISTS public.decision_pulse_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_collapsed boolean NOT NULL DEFAULT false,
  last_explored_budget numeric,
  pinned_verdict_strategy text,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT decision_pulse_last_explored_budget_valid
    CHECK (
      last_explored_budget IS NULL OR (
        last_explored_budget >= 0 AND last_explored_budget <= 1000000
      )
    ),
  CONSTRAINT decision_pulse_pinned_strategy_valid
    CHECK (
      pinned_verdict_strategy IS NULL OR pinned_verdict_strategy = ANY (ARRAY[
        'highestRate', 'highestPiPerDollar', 'highestCashflowBoost',
        'lowestBalance', 'lowestDscr', 'highestInterestCost'
      ])
    )
);

ALTER TABLE public.decision_pulse_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_pulse_preferences_select_own ON public.decision_pulse_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY decision_pulse_preferences_insert_own ON public.decision_pulse_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY decision_pulse_preferences_update_own ON public.decision_pulse_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY decision_pulse_preferences_delete_own ON public.decision_pulse_preferences
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.decision_pulse_preferences IS
  'Per-user Decision Pulse UI preferences (collapse state, last explored budget).';
