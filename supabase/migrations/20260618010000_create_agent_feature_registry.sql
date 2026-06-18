-- Agent Feature Registry: coordinates parallel cloud agents so they do not build the same feature.

CREATE TABLE IF NOT EXISTS public.agent_feature_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_slug text NOT NULL,
  feature_title text NOT NULL,
  agent_session_id text NOT NULL,
  status text NOT NULL DEFAULT 'claimed',
  branch_name text,
  pr_url text,
  rationale text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_feature_slug_valid
    CHECK (char_length(TRIM(BOTH FROM feature_slug)) > 0),
  CONSTRAINT agent_feature_title_valid
    CHECK (char_length(TRIM(BOTH FROM feature_title)) > 0),
  CONSTRAINT agent_session_id_valid
    CHECK (char_length(TRIM(BOTH FROM agent_session_id)) > 0),
  CONSTRAINT agent_feature_status_valid
    CHECK (status = ANY (ARRAY['claimed'::text, 'in_progress'::text, 'completed'::text, 'abandoned'::text])),
  CONSTRAINT agent_feature_branch_valid
    CHECK (branch_name IS NULL OR char_length(TRIM(BOTH FROM branch_name)) > 0),
  CONSTRAINT agent_feature_pr_url_valid
    CHECK (pr_url IS NULL OR pr_url ~ '^https?://'),
  CONSTRAINT agent_feature_rationale_len
    CHECK (rationale IS NULL OR char_length(rationale) <= 2000),
  CONSTRAINT agent_feature_expires_after_claim
    CHECK (expires_at > claimed_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_feature_registry_active_slug_idx
  ON public.agent_feature_registry (feature_slug)
  WHERE status IN ('claimed', 'in_progress');

CREATE INDEX IF NOT EXISTS agent_feature_registry_status_expires_idx
  ON public.agent_feature_registry (status, expires_at);

COMMENT ON TABLE public.agent_feature_registry IS
  'Coordinates parallel Cursor Cloud Agents — one active claim per feature slug.';

ALTER TABLE public.agent_feature_registry ENABLE ROW LEVEL SECURITY;

-- Service role only (server API); no direct client access.
CREATE POLICY agent_feature_registry_deny_all ON public.agent_feature_registry
  FOR ALL USING (false);
