-- Ticket 188: durable Persona training lifecycle.
-- `review` becomes the canonical post-training state before likeness
-- confirmation. A signed successful fal callback durably persists
-- `training -> review` (Family-owned LoRA key + review sample keys) in the
-- SAME transaction as the fal request completion, so a crash can never split
-- the two. A real training failure marks the Persona `failed` with a redacted
-- reason. Legacy `ready` maps to Story-ready only when likeness_confirmed is
-- true (persisted generated column); `failed` is terminal; `review` and
-- `training` are spend-blocked.

ALTER TABLE personas
  DROP CONSTRAINT IF EXISTS personas_status_check;

ALTER TABLE personas
  ADD CONSTRAINT personas_status_check
    CHECK (status IN ('training', 'review', 'ready', 'failed'));

ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- Persisted Story-ready mapping: `ready` AND `likeness_confirmed` only.
ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS story_ready boolean
    GENERATED ALWAYS AS (status = 'ready' AND likeness_confirmed) STORED;

-- Extend the fal callback completion so a signed OK callback durably moves the
-- Persona to `review` and a real failure marks it `failed`, atomically with the
-- fal request state. Stale callbacks (request already ready/failed) can never
-- resurrect or move a Persona that left `training`.
CREATE OR REPLACE FUNCTION app_complete_fal_training_callback(
  p_request_id text,
  p_fingerprint text,
  p_status text,
  p_lora_weight_key text DEFAULT NULL,
  p_configuration_key text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_review_sample_keys jsonb DEFAULT NULL
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
  v_sample_prefix text;
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
      IF p_review_sample_keys IS NOT NULL THEN
        v_sample_prefix := 'likeness-samples/' || v_request.family_id::text || '/' || v_request.persona_id::text || '/';
        IF jsonb_typeof(p_review_sample_keys) <> 'array'
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p_review_sample_keys) sample_key
            WHERE sample_key NOT LIKE v_sample_prefix || '%' OR sample_key LIKE 'http%'
          )
        THEN
          RAISE EXCEPTION 'Fal review samples are not Family-owned keys';
        END IF;
      END IF;
    END IF;

    UPDATE fal_training_requests request
    SET status = p_status,
        lora_weight_key = CASE WHEN p_status = 'ready' THEN p_lora_weight_key ELSE request.lora_weight_key END,
        configuration_key = CASE WHEN p_status = 'ready' THEN p_configuration_key ELSE request.configuration_key END,
        error = CASE WHEN p_status = 'failed' THEN left(coalesce(p_error, 'fal training failed'), 500) ELSE NULL END,
        updated_at = now()
    WHERE request.request_id = p_request_id;

    IF p_status = 'ready' THEN
      UPDATE personas persona
      SET status = 'review',
          lora_weight_key = p_lora_weight_key,
          review_sample_keys = COALESCE(p_review_sample_keys, '[]'::jsonb),
          failure_reason = NULL
      WHERE persona.id = v_request.persona_id
        AND persona.status = 'training';
    ELSIF p_status = 'failed' THEN
      UPDATE personas persona
      SET status = 'failed',
          failure_reason = left(coalesce(p_error, 'fal training failed'), 500)
      WHERE persona.id = v_request.persona_id
        AND persona.status = 'training';
    END IF;
  END IF;

  UPDATE fal_webhook_receipts receipt
  SET status = 'completed', lease_expires_at = NULL
  WHERE receipt.fingerprint = p_fingerprint;
END;
$$;

-- Authenticated, durable review -> training retrain. Only the subject of an
-- Adult Persona (the Member linked by the subject consent receipt) or a
-- Guardian for a Baby Persona may invoke it; the Persona must be in `review`.
CREATE OR REPLACE FUNCTION app_transition_persona_review_training(p_persona_id uuid)
RETURNS TABLE (persona_id uuid, status text, story_ready boolean, likeness_confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
  v_persona personas%ROWTYPE;
  v_subject_member_id uuid;
BEGIN
  SELECT * INTO v_member
  FROM members
  WHERE auth_user_id = auth.uid()
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated Member not found';
  END IF;

  SELECT * INTO v_persona
  FROM personas persona
  WHERE persona.id = p_persona_id
    AND persona.family_id = v_member.family_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found';
  END IF;

  IF v_persona.status <> 'review' THEN
    RAISE EXCEPTION 'Only a Persona in likeness review may be retrained';
  END IF;

  IF v_persona.kind = 'baby' THEN
    IF v_member.role <> 'guardian' THEN
      RAISE EXCEPTION 'Only Guardians may retrain a Baby Persona';
    END IF;
  ELSE
    SELECT receipt.subject_member_id INTO v_subject_member_id
    FROM consent_receipts receipt
    WHERE receipt.subject_persona_id = v_persona.id
      AND receipt.family_id = v_persona.family_id
    LIMIT 1;
    IF v_subject_member_id IS NULL OR v_subject_member_id <> v_member.id THEN
      RAISE EXCEPTION 'Only the Adult subject may retrain their own likeness';
    END IF;
  END IF;

  UPDATE personas persona
  SET status = 'training',
      likeness_confirmed = false,
      review_sample_keys = '[]'::jsonb,
      failure_reason = NULL
  WHERE persona.id = v_persona.id;

  RETURN QUERY SELECT v_persona.id, 'training'::text, false, false;
END;
$$;

-- Authenticated read of the persisted training lifecycle for the production
-- API: status, likeness_confirmed, the persisted story_ready mapping, and the
-- redacted failure reason. Family-scoped by the calling Member.
CREATE OR REPLACE FUNCTION app_read_persona_training_lifecycle(p_persona_id uuid)
RETURNS TABLE (
  persona_id uuid,
  status text,
  likeness_confirmed boolean,
  story_ready boolean,
  lora_weight_key text,
  review_sample_keys jsonb,
  failure_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
BEGIN
  SELECT * INTO v_member
  FROM members
  WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated Member not found';
  END IF;

  RETURN QUERY
  SELECT persona.id,
         persona.status,
         persona.likeness_confirmed,
         persona.story_ready,
         persona.lora_weight_key,
         persona.review_sample_keys,
         persona.failure_reason
  FROM personas persona
  WHERE persona.id = p_persona_id
    AND persona.family_id = v_member.family_id;
END;
$$;

REVOKE ALL ON FUNCTION app_transition_persona_review_training(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_transition_persona_review_training(uuid) TO authenticated;

REVOKE ALL ON FUNCTION app_read_persona_training_lifecycle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_read_persona_training_lifecycle(uuid) TO authenticated;
