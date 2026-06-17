-- Per-user portfolio rows keyed by Supabase auth user id.
-- Service role API still accesses rows by id; RLS protects direct client access.

ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_snapshots_user_id_idx
  ON portfolio_snapshots (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN portfolio_snapshots.user_id IS 'Owner when id matches auth.users.id; null for legacy default row';

-- RLS: authenticated users can read/write only their own portfolio row (id = auth.uid()).
DROP POLICY IF EXISTS portfolio_snapshots_select_own ON portfolio_snapshots;
DROP POLICY IF EXISTS portfolio_snapshots_insert_own ON portfolio_snapshots;
DROP POLICY IF EXISTS portfolio_snapshots_update_own ON portfolio_snapshots;
DROP POLICY IF EXISTS portfolio_snapshots_delete_own ON portfolio_snapshots;

CREATE POLICY portfolio_snapshots_select_own ON portfolio_snapshots
  FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

CREATE POLICY portfolio_snapshots_insert_own ON portfolio_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text);

CREATE POLICY portfolio_snapshots_update_own ON portfolio_snapshots
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

CREATE POLICY portfolio_snapshots_delete_own ON portfolio_snapshots
  FOR DELETE TO authenticated
  USING (id = auth.uid()::text);
