-- LUL-104: durable, lease-based fal callback claims and atomic lifecycle completion.
-- A receipt is claimed before artifact work, completed in the same transaction as
-- the request transition, and may be retried after an explicit release or lease expiry.

ALTER TABLE fal_webhook_receipts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('processing', 'completed')),
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE OR REPLACE FUNCTION app_claim_fal_training_callback(
  p_request_id text,
  p_fingerprint text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (
  claimed boolean,
  duplicate boolean,
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
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request fal_training_requests%ROWTYPE;
  v_receipt fal_webhook_receipts%ROWTYPE;
  v_claimed boolean := false;
  v_inserted integer := 0;
BEGIN
  IF p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Fal callback lease must be between 1 and 300 seconds';
  END IF;

  SELECT * INTO v_request
  FROM fal_training_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown fal training request';
  END IF;

  INSERT INTO fal_webhook_receipts (
    fingerprint, request_id, family_id, received_at, status, lease_expires_at
  ) VALUES (
    p_fingerprint, p_request_id, v_request.family_id, now(), 'processing',
    now() + make_interval(secs => p_lease_seconds)
  )
  ON CONFLICT (fingerprint) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_claimed := v_inserted = 1;
  IF NOT v_claimed THEN
    SELECT * INTO v_receipt
    FROM fal_webhook_receipts receipt
    WHERE receipt.fingerprint = p_fingerprint
    FOR UPDATE;

    IF v_receipt.request_id <> p_request_id THEN
      RAISE EXCEPTION 'Fal callback fingerprint request mismatch';
    END IF;

    IF v_receipt.status = 'processing' AND v_receipt.lease_expires_at <= now() THEN
      UPDATE fal_webhook_receipts receipt
      SET received_at = now(),
          lease_expires_at = now() + make_interval(secs => p_lease_seconds)
      WHERE receipt.fingerprint = p_fingerprint;
      v_claimed := true;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_claimed,
    NOT v_claimed,
    v_request.request_id,
    v_request.family_id,
    v_request.persona_id,
    v_request.endpoint,
    v_request.model,
    v_request.steps,
    v_request.idempotency_key,
    v_request.status,
    v_request.input_zip_key,
    v_request.lora_weight_key,
    v_request.configuration_key,
    v_request.error,
    v_request.created_at,
    v_request.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION app_complete_fal_training_callback(
  p_request_id text,
  p_fingerprint text,
  p_status text,
  p_lora_weight_key text DEFAULT NULL,
  p_configuration_key text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request fal_training_requests%ROWTYPE;
  v_receipt fal_webhook_receipts%ROWTYPE;
  v_weight_prefix text;
BEGIN
  IF p_status NOT IN ('running', 'ready', 'failed') THEN
    RAISE EXCEPTION 'Invalid fal training callback status';
  END IF;

  SELECT * INTO v_receipt
  FROM fal_webhook_receipts receipt
  WHERE receipt.fingerprint = p_fingerprint
    AND receipt.request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_receipt.status <> 'processing' THEN
    RAISE EXCEPTION 'Fal callback claim is not active';
  END IF;

  SELECT * INTO v_request
  FROM fal_training_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown fal training request';
  END IF;

  IF v_request.status NOT IN ('ready', 'failed') THEN
    IF p_status = 'ready' THEN
      v_weight_prefix := 'lora/' || v_request.family_id::text || '/' || v_request.persona_id::text || '/';
      IF p_lora_weight_key IS NULL OR p_configuration_key IS NULL
        OR p_lora_weight_key NOT LIKE v_weight_prefix || '%'
        OR p_configuration_key NOT LIKE v_weight_prefix || '%'
        OR p_lora_weight_key LIKE 'http%'
        OR p_configuration_key LIKE 'http%'
      THEN
        RAISE EXCEPTION 'Fal artifacts are not Family-owned keys';
      END IF;
    END IF;

    UPDATE fal_training_requests request
    SET status = p_status,
        lora_weight_key = CASE WHEN p_status = 'ready' THEN p_lora_weight_key ELSE request.lora_weight_key END,
        configuration_key = CASE WHEN p_status = 'ready' THEN p_configuration_key ELSE request.configuration_key END,
        error = CASE WHEN p_status = 'failed' THEN left(coalesce(p_error, 'fal training failed'), 500) ELSE NULL END,
        updated_at = now()
    WHERE request.request_id = p_request_id;
  END IF;

  UPDATE fal_webhook_receipts receipt
  SET status = 'completed', lease_expires_at = NULL
  WHERE receipt.fingerprint = p_fingerprint;
END;
$$;

CREATE OR REPLACE FUNCTION app_release_fal_training_callback(
  p_request_id text,
  p_fingerprint text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM fal_webhook_receipts receipt
  WHERE receipt.fingerprint = p_fingerprint
    AND receipt.request_id = p_request_id
    AND receipt.status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION app_claim_fal_training_callback(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_complete_fal_training_callback(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_release_fal_training_callback(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION app_claim_fal_training_callback(text, text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION app_complete_fal_training_callback(text, text, text, text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION app_release_fal_training_callback(text, text) TO service_role;
  END IF;
END $$;
