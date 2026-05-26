-- Single-row portfolio store for the rental snowball tracker
CREATE TABLE portfolio_snapshots (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE portfolio_snapshots IS 'Authoritative portfolio JSON; accessed via server API only';
