-- LUL-105 / Issue 180: pending Brief claims and likeness-review derivatives
-- must survive a SupabaseDataStore hydrate → sync → restart cycle.

ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS review_sample_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE pending_briefs
  ADD COLUMN IF NOT EXISTS selected_persona_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'failed', 'accepted')),
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS storybook_id uuid REFERENCES storybooks (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE pending_briefs
  ADD CONSTRAINT pending_briefs_accepted_requires_storybook
  CHECK (status <> 'accepted' OR storybook_id IS NOT NULL) NOT VALID;

-- A worker can only take a pending/failed Brief or a lease that has expired.
-- The function is service-composed, but its row lock makes process restart and
-- duplicate ready callbacks unable to obtain simultaneous pre-spend claims.
CREATE OR REPLACE FUNCTION app_claim_pending_brief(
  p_key text,
  p_claim_token uuid,
  p_now timestamptz,
  p_lease_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending pending_briefs%ROWTYPE;
BEGIN
  SELECT * INTO v_pending FROM pending_briefs WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending Brief is missing'; END IF;
  IF v_pending.status = 'accepted' THEN RETURN to_jsonb(v_pending) || jsonb_build_object('claimed_now', false); END IF;
  IF v_pending.status = 'running' AND v_pending.claim_expires_at > p_now THEN
    RETURN to_jsonb(v_pending) || jsonb_build_object('claimed_now', false);
  END IF;
  UPDATE pending_briefs
  SET status = 'running', claim_token = p_claim_token,
      claimed_at = p_now, claim_expires_at = p_lease_expires_at,
      error = NULL, failed_at = NULL
  WHERE key = p_key
  RETURNING * INTO v_pending;
  RETURN to_jsonb(v_pending) || jsonb_build_object('claimed_now', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION app_claim_pending_brief(text, uuid, timestamptz, timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_claim_pending_brief(text, uuid, timestamptz, timestamptz) TO service_role';
  END IF;
END $$;
