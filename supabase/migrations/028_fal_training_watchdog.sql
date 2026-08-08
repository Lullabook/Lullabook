-- Ticket 208 / FAIL-4: reconciliation watchdog for fal LoRA trainings whose
-- callback never arrives. Two additions, both safe to re-run:
--   1. `status_url` — the fal queue status URL retained at submit time so the
--      watchdog polls the exact queue entry instead of guessing one.
--   2. `app_list_stale_fal_training_requests` — the FIND seam: in-flight
--      (`queued`/`running`) requests with no lifecycle progress since a given
--      instant, OR already past their LAT-5 deadline. Reading only; every
--      state change still goes through the
--      existing claim/complete callback functions, so the watchdog cannot
--      double-advance a request a callback already terminalized.

ALTER TABLE fal_training_requests
  ADD COLUMN IF NOT EXISTS status_url text;

CREATE INDEX IF NOT EXISTS fal_training_requests_in_flight_idx
  ON fal_training_requests (updated_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS fal_training_requests_in_flight_deadline_idx
  ON fal_training_requests (created_at)
  WHERE status IN ('queued', 'running');

-- The 2-argument form shipped in an earlier draft of this migration; the
-- deadline argument is required so a heartbeating training can never outlive
-- its LAT-5 budget (see `p_deadline_before` below).
DROP FUNCTION IF EXISTS app_list_stale_fal_training_requests(timestamptz, integer);

CREATE OR REPLACE FUNCTION app_list_stale_fal_training_requests(
  p_idle_since timestamptz,
  p_deadline_before timestamptz,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  request_id text,
  family_id uuid,
  persona_id uuid,
  endpoint text,
  model text,
  steps integer,
  idempotency_key text,
  status text,
  input_zip_key text,
  lora_weight_key text,
  configuration_key text,
  error text,
  status_url text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_idle_since IS NULL OR p_deadline_before IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid fal training watchdog request';
  END IF;

  RETURN QUERY
  SELECT
    request.request_id,
    request.family_id,
    request.persona_id,
    request.endpoint,
    request.model,
    request.steps,
    request.idempotency_key,
    request.status,
    request.input_zip_key,
    request.lora_weight_key,
    request.configuration_key,
    request.error,
    request.status_url,
    request.created_at,
    request.updated_at
  FROM fal_training_requests request
  WHERE request.status IN ('queued', 'running')
    -- Idle (no lifecycle progress since `p_idle_since`) OR past its LAT-5
    -- deadline. The second arm matters: a training the watchdog heart-beats
    -- to `running` refreshes `updated_at`, so an idle-only listing could push
    -- its terminal transition past the 25-minute budget.
    AND (request.updated_at <= p_idle_since OR request.created_at <= p_deadline_before)
  ORDER BY request.created_at <= p_deadline_before DESC, request.updated_at, request.request_id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION app_list_stale_fal_training_requests(timestamptz, timestamptz, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION app_list_stale_fal_training_requests(timestamptz, timestamptz, integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION app_list_stale_fal_training_requests(timestamptz, timestamptz, integer) TO service_role;
  END IF;
END $$;
