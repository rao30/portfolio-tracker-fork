-- Strategy Lab: pinned what-if scenarios (budget + payoff strategy) per user.
CREATE TABLE strategy_lab_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled',
  extra_monthly_budget numeric NOT NULL DEFAULT 0,
  strategy_id text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT true,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_scenarios_name_nonempty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT strategy_lab_scenarios_name_length CHECK (char_length(name) <= 80),
  CONSTRAINT strategy_lab_scenarios_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT strategy_lab_scenarios_budget_range CHECK (
    extra_monthly_budget >= 0 AND extra_monthly_budget <= 1000000
  ),
  CONSTRAINT strategy_lab_scenarios_sort_order_range CHECK (
    sort_order >= 0 AND sort_order <= 1000
  ),
  CONSTRAINT strategy_lab_scenarios_strategy_valid CHECK (
    strategy_id = ANY (
      ARRAY[
        'highestRate',
        'highestPiPerDollar',
        'highestCashflowBoost',
        'lowestBalance',
        'lowestDscr',
        'highestInterestCost'
      ]
    )
  )
);

CREATE UNIQUE INDEX strategy_lab_scenarios_user_name_idx
  ON strategy_lab_scenarios (user_id, lower(trim(name)));

CREATE INDEX strategy_lab_scenarios_user_pinned_idx
  ON strategy_lab_scenarios (user_id, is_pinned, sort_order);

COMMENT ON TABLE strategy_lab_scenarios IS
  'Pinned Strategy Lab what-if scenarios (budget + payoff strategy) per authenticated user.';

ALTER TABLE strategy_lab_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategy_lab_scenarios_select_own ON strategy_lab_scenarios
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY strategy_lab_scenarios_insert_own ON strategy_lab_scenarios
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY strategy_lab_scenarios_update_own ON strategy_lab_scenarios
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY strategy_lab_scenarios_delete_own ON strategy_lab_scenarios
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
