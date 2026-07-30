-- Ticket 176: restart-safe, service-role-only claims for the paid provider canary.
-- A pre-spend claim reserves worst-case cost atomically. Existing claimed or
-- unknown-billing rows are never automatically resubmitted after a crash.

CREATE TABLE IF NOT EXISTS provider_bakeoff_runs (
  run_id text PRIMARY KEY,
  fixture_manifest_sha256 text NOT NULL CHECK (fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  budget_usd numeric NOT NULL CHECK (budget_usd > 0 AND budget_usd <= 10),
  reserved_usd numeric NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  actual_cost_usd numeric NOT NULL DEFAULT 0 CHECK (actual_cost_usd >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS provider_bakeoff_operations (
  run_id text NOT NULL REFERENCES provider_bakeoff_runs (run_id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('fal', 'anthropic')),
  kind text NOT NULL CHECK (kind IN ('training', 'generation', 'repair', 'story')),
  model text NOT NULL,
  endpoint text NOT NULL,
  fixture_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed', 'succeeded', 'failed', 'unknown_billing')),
  reserved_usd numeric NOT NULL CHECK (reserved_usd > 0),
  actual_cost_usd numeric,
  evidence jsonb,
  error text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (run_id, operation_id)
);

ALTER TABLE provider_bakeoff_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_bakeoff_operations ENABLE ROW LEVEL SECURITY;
-- No client policies: only the service role and the locked-down functions below
-- may inspect or mutate paid-canary state.

CREATE OR REPLACE FUNCTION app_begin_provider_bakeoff_run(
  p_run_id text,
  p_fixture_manifest_sha256 text,
  p_budget_usd numeric,
  p_started_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run provider_bakeoff_runs%ROWTYPE;
BEGIN
  INSERT INTO provider_bakeoff_runs (
    run_id, fixture_manifest_sha256, budget_usd, started_at
  ) VALUES (
    p_run_id, p_fixture_manifest_sha256, p_budget_usd, p_started_at
  ) ON CONFLICT (run_id) DO NOTHING;

  SELECT * INTO v_run
  FROM provider_bakeoff_runs
  WHERE run_id = p_run_id;

  IF v_run.fixture_manifest_sha256 <> p_fixture_manifest_sha256
     OR v_run.budget_usd <> p_budget_usd THEN
    RAISE EXCEPTION 'A resumed provider bake-off run must use the same fixture and budget';
  END IF;

  RETURN to_jsonb(v_run);
END;
$$;

CREATE OR REPLACE FUNCTION app_claim_provider_bakeoff_operation(
  p_run_id text,
  p_operation_id text,
  p_provider text,
  p_kind text,
  p_model text,
  p_endpoint text,
  p_fixture_id text,
  p_reserved_usd numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run provider_bakeoff_runs%ROWTYPE;
  v_operation provider_bakeoff_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_run
  FROM provider_bakeoff_runs
  WHERE run_id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider bake-off run is missing';
  END IF;

  SELECT * INTO v_operation
  FROM provider_bakeoff_operations
  WHERE run_id = p_run_id AND operation_id = p_operation_id;

  IF FOUND THEN
    RETURN to_jsonb(v_operation) || jsonb_build_object('claimed_now', false);
  END IF;

  IF p_reserved_usd <= 0 OR v_run.reserved_usd + p_reserved_usd > v_run.budget_usd THEN
    RAISE EXCEPTION 'Provider bake-off budget exceeded before operation %', p_operation_id;
  END IF;

  UPDATE provider_bakeoff_runs
  SET reserved_usd = reserved_usd + p_reserved_usd
  WHERE run_id = p_run_id;

  INSERT INTO provider_bakeoff_operations (
    run_id, operation_id, provider, kind, model, endpoint, fixture_id,
    status, reserved_usd
  ) VALUES (
    p_run_id, p_operation_id, p_provider, p_kind, p_model, p_endpoint,
    p_fixture_id, 'claimed', p_reserved_usd
  )
  RETURNING * INTO v_operation;

  RETURN to_jsonb(v_operation) || jsonb_build_object('claimed_now', true);
END;
$$;

CREATE OR REPLACE FUNCTION app_complete_provider_bakeoff_operation(
  p_run_id text,
  p_operation_id text,
  p_status text,
  p_actual_cost_usd numeric,
  p_evidence jsonb,
  p_error text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation provider_bakeoff_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation
  FROM provider_bakeoff_operations
  WHERE run_id = p_run_id AND operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider bake-off operation claim is missing';
  END IF;
  IF v_operation.status <> 'claimed' THEN
    RETURN to_jsonb(v_operation);
  END IF;
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'Provider bake-off terminal status is invalid';
  END IF;
  IF p_actual_cost_usd IS NOT NULL AND (
    p_actual_cost_usd < 0 OR p_actual_cost_usd > v_operation.reserved_usd
  ) THEN
    RAISE EXCEPTION 'Provider bake-off actual cost exceeds its reservation';
  END IF;

  UPDATE provider_bakeoff_operations
  SET status = p_status,
      actual_cost_usd = p_actual_cost_usd,
      evidence = p_evidence,
      error = left(p_error, 500),
      completed_at = now()
  WHERE run_id = p_run_id AND operation_id = p_operation_id
  RETURNING * INTO v_operation;

  UPDATE provider_bakeoff_runs
  SET actual_cost_usd = COALESCE((
    SELECT sum(actual_cost_usd)
    FROM provider_bakeoff_operations
    WHERE run_id = p_run_id
  ), 0)
  WHERE run_id = p_run_id;

  RETURN to_jsonb(v_operation);
END;
$$;

CREATE OR REPLACE FUNCTION app_mark_provider_bakeoff_unknown(
  p_run_id text,
  p_operation_id text,
  p_error text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE provider_bakeoff_operations
  SET status = 'unknown_billing',
      actual_cost_usd = NULL,
      evidence = NULL,
      error = left(p_error, 500),
      completed_at = now()
  WHERE run_id = p_run_id
    AND operation_id = p_operation_id
    AND status = 'claimed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider bake-off operation claim is missing or already terminal';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_complete_provider_bakeoff_run(
  p_run_id text,
  p_completed_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM provider_bakeoff_operations
    WHERE run_id = p_run_id AND status IN ('claimed', 'unknown_billing')
  ) THEN
    RAISE EXCEPTION 'Provider bake-off run has unreconciled operations';
  END IF;

  UPDATE provider_bakeoff_runs
  SET completed_at = COALESCE(completed_at, p_completed_at)
  WHERE run_id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider bake-off run is missing';
  END IF;
END;
$$;

REVOKE ALL ON provider_bakeoff_runs, provider_bakeoff_operations FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_begin_provider_bakeoff_run(text, text, numeric, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_claim_provider_bakeoff_operation(text, text, text, text, text, text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_complete_provider_bakeoff_operation(text, text, text, numeric, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_mark_provider_bakeoff_unknown(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_complete_provider_bakeoff_run(text, timestamptz) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON provider_bakeoff_runs, provider_bakeoff_operations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON provider_bakeoff_runs, provider_bakeoff_operations FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON provider_bakeoff_runs, provider_bakeoff_operations TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_begin_provider_bakeoff_run(text, text, numeric, timestamptz) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_claim_provider_bakeoff_operation(text, text, text, text, text, text, text, numeric) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_complete_provider_bakeoff_operation(text, text, text, numeric, jsonb, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_mark_provider_bakeoff_unknown(text, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_complete_provider_bakeoff_run(text, timestamptz) TO service_role';
  END IF;
END $$;
