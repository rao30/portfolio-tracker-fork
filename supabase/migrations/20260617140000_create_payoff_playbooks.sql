-- Payoff Playbook: user-defined custom payoff order with cloud persistence.

CREATE TABLE IF NOT EXISTS public.payoff_playbooks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  property_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_strategy text,
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payoff_playbooks_property_order_is_array
    CHECK (jsonb_typeof(property_order) = 'array'),
  CONSTRAINT payoff_playbooks_base_strategy_valid
    CHECK (
      base_strategy IS NULL OR base_strategy = ANY (ARRAY[
        'highestRate', 'highestPiPerDollar', 'highestCashflowBoost',
        'lowestBalance', 'lowestDscr', 'highestInterestCost'
      ])
    )
);

CREATE INDEX IF NOT EXISTS payoff_playbooks_active_idx
  ON public.payoff_playbooks (user_id)
  WHERE is_active = true;

ALTER TABLE public.payoff_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY payoff_playbooks_select_own ON public.payoff_playbooks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY payoff_playbooks_insert_own ON public.payoff_playbooks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY payoff_playbooks_update_own ON public.payoff_playbooks
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY payoff_playbooks_delete_own ON public.payoff_playbooks
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.payoff_playbooks IS
  'Custom drag-and-drop payoff order (Payoff Playbook) per authenticated user.';
