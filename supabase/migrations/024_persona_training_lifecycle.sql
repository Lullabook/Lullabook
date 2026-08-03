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

-- Keep the database gate aligned with the jurisdiction configuration table.
-- Migration 017 encoded the then-current US channels in a CASE expression,
-- which silently rejected configured markets such as IN. Preserve any
-- ops-managed rows and add the iOS US channel that predates the table row.
INSERT INTO jurisdiction_configs (
  code, child_age_threshold, consent_method, character_consent_method,
  notice_version, residency_region, enabled
) VALUES (
  'US_IOS', 13, 'email_plus', 'light_attestation', 'us-coppa-v1', 'us-east-1', true
)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.app_persona_creation_baby_consent_is_canonical(
  p_jurisdiction text,
  p_method text,
  p_notice_version text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jurisdiction_configs config
    WHERE config.code = p_jurisdiction
      AND config.enabled
      AND config.consent_method IS NOT DISTINCT FROM p_method
      AND config.notice_version IS NOT DISTINCT FROM p_notice_version
  )
$$;

REVOKE ALL ON FUNCTION public.app_persona_creation_baby_consent_is_canonical(text, text, text) FROM PUBLIC;

-- Adult self-consent is Member-owned. The hardened 017 wrapper accidentally
-- retained the old Guardian check and then delegated to the common prepare
-- function, so an ordinary Member could never reserve their own Persona.
CREATE OR REPLACE FUNCTION public.app_prepare_adult_persona_creation(
  p_display_name text,
  p_photo_count integer,
  p_request_fingerprint text
)
RETURNS TABLE (id uuid, family_id uuid, state text, photo_keys jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.members%ROWTYPE;
  v_existing public.persona_creation_reservations%ROWTYPE;
  v_reservation_id uuid := gen_random_uuid();
  v_persona_id uuid := gen_random_uuid();
  v_receipt_id uuid := gen_random_uuid();
  v_photo_keys jsonb;
  v_capacity integer;
BEGIN
  IF p_photo_count IS NULL OR p_photo_count < 1 OR p_photo_count > 20
    OR p_display_name IS NULL OR length(trim(p_display_name)) = 0
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid Adult Persona creation reservation';
  END IF;

  SELECT * INTO v_member
  FROM public.members member
  WHERE member.auth_user_id = auth.uid()
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated Member not found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_member.family_id::text || ':' || p_request_fingerprint, 0)
  );
  SELECT * INTO v_existing
  FROM public.persona_creation_reservations reservation
  WHERE reservation.family_id = v_member.family_id
    AND reservation.request_fingerprint = p_request_fingerprint;
  IF FOUND THEN
    IF v_existing.member_id IS DISTINCT FROM v_member.id
      OR v_existing.kind IS DISTINCT FROM 'adult'
      OR v_existing.display_name IS DISTINCT FROM trim(p_display_name)
      OR jsonb_array_length(v_existing.photo_keys) IS DISTINCT FROM p_photo_count
      OR v_existing.baby IS NOT NULL
      OR v_existing.bond IS NOT NULL
      OR NOT v_existing.owns_adult_consent_receipt
      OR v_existing.adult_consent_receipt_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.consent_receipts receipt
        WHERE receipt.id = v_existing.adult_consent_receipt_id
          AND receipt.family_id = v_existing.family_id
          AND receipt.member_id = v_existing.member_id
          AND receipt.subject_member_id = v_existing.member_id
          AND receipt.notice_version = 'r1-adult-persona-v1'
          AND receipt.method = 'signed_form'
          AND receipt.status = 'verified'
          AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = v_existing.persona_id)
          AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
      )
    THEN
      RAISE EXCEPTION 'Request fingerprint does not match the immutable Adult Persona identity or self-consent ownership';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.family_id, v_existing.state, v_existing.photo_keys;
    RETURN;
  END IF;

  INSERT INTO public.consent_receipts (
    id, family_id, member_id, subject_member_id, jurisdiction,
    notice_version, method, status
  ) VALUES (
    v_receipt_id, v_member.family_id, v_member.id, v_member.id,
    v_member.jurisdiction, 'r1-adult-persona-v1', 'signed_form', 'verified'
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('persona-capacity:' || v_member.family_id::text, 0));
  SELECT count(*) INTO v_capacity
  FROM public.personas persona
  WHERE persona.family_id = v_member.family_id;
  SELECT v_capacity + count(*) INTO v_capacity
  FROM public.persona_creation_reservations reservation
  WHERE reservation.family_id = v_member.family_id
    AND reservation.state IN ('prepared', 'uploaded');
  IF v_capacity >= 3 THEN
    RAISE EXCEPTION 'Persona capacity has been reached';
  END IF;

  SELECT jsonb_agg(
    format('persona-creation/%s/%s/photos/%s.jpg', v_member.family_id, v_reservation_id, photo_index)
    ORDER BY photo_index
  ) INTO v_photo_keys
  FROM generate_series(0, p_photo_count - 1) AS photo_index;

  INSERT INTO public.persona_creation_reservations (
    id, family_id, member_id, request_fingerprint, persona_id,
    adult_consent_receipt_id, baby_consent_receipt_id, owns_adult_consent_receipt,
    kind, display_name, baby, bond, photo_keys, state, expires_at
  ) VALUES (
    v_reservation_id, v_member.family_id, v_member.id, p_request_fingerprint, v_persona_id,
    v_receipt_id, NULL, true, 'adult', trim(p_display_name), NULL, NULL,
    v_photo_keys, 'prepared', now() + interval '30 minutes'
  );

  RETURN QUERY SELECT v_reservation_id, v_member.family_id, 'prepared'::text, v_photo_keys;
END
$$;

-- Extend the fal callback completion so a signed OK callback durably moves the
-- Persona to `review` and a real failure marks it `failed`, atomically with the
-- fal request state. Stale callbacks (request already ready/failed) can never
-- resurrect or move a Persona that left `training`.
DROP FUNCTION IF EXISTS public.app_complete_fal_training_callback(text, text, text, text, text, text);
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

-- Finalization is worker-owned, but its Persona authorization still differs by
-- kind: Baby remains Guardian-only while an Adult reservation is owned by the
-- authenticated subject Member who created its consent receipt.
CREATE OR REPLACE FUNCTION public.app_finalize_persona_creation(p_reservation_id uuid)
RETURNS TABLE (id uuid, state text, outbox_event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reservation public.persona_creation_reservations%ROWTYPE;
  v_member public.members%ROWTYPE;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_reservation
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation reservation not found';
  END IF;
  IF v_reservation.state = 'finalized' THEN
    SELECT outbox.id INTO v_outbox_id
    FROM public.persona_creation_outbox outbox
    WHERE outbox.reservation_id = v_reservation.id;
    IF v_outbox_id IS NULL THEN
      RAISE EXCEPTION 'Finalized Persona creation is missing its outbox event';
    END IF;
    RETURN QUERY SELECT v_reservation.id, v_reservation.state, v_outbox_id;
    RETURN;
  END IF;
  IF v_reservation.state <> 'uploaded' OR v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'Persona creation reservation is not ready to finalize';
  END IF;
  IF NOT public.app_persona_creation_keys_are_scoped(
    v_reservation.family_id, v_reservation.id, v_reservation.photo_keys
  ) THEN
    RAISE EXCEPTION 'Persona creation photo keys are not creation-scoped';
  END IF;

  SELECT * INTO v_member
  FROM public.members member
  WHERE member.id = v_reservation.member_id
    AND member.family_id = v_reservation.family_id
  FOR SHARE;
  IF NOT FOUND OR (v_reservation.kind = 'baby' AND v_member.role <> 'guardian') THEN
    RAISE EXCEPTION 'Guardian authority is required to finalize a Baby Persona';
  END IF;

  IF v_reservation.kind = 'baby' THEN
    PERFORM 1
    FROM public.consent_receipts receipt
    WHERE receipt.id = v_reservation.baby_consent_receipt_id
      AND receipt.family_id = v_reservation.family_id
      AND receipt.member_id = v_reservation.member_id
      AND receipt.subject_member_id IS NULL
      AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = v_reservation.persona_id)
      AND receipt.jurisdiction = v_member.jurisdiction
      AND public.app_persona_creation_baby_consent_is_canonical(
        receipt.jurisdiction, receipt.method, receipt.notice_version
      )
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The exact reserved canonical Baby consent is unavailable';
    END IF;
  ELSE
    PERFORM 1
    FROM public.consent_receipts receipt
    WHERE receipt.id = v_reservation.adult_consent_receipt_id
      AND receipt.family_id = v_reservation.family_id
      AND receipt.member_id = v_reservation.member_id
      AND receipt.subject_member_id = v_reservation.member_id
      AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = v_reservation.persona_id)
      AND receipt.jurisdiction = v_member.jurisdiction
      AND receipt.method = 'signed_form'
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Verified unused subject-linked Adult consent is required to finalize';
    END IF;
  END IF;

  INSERT INTO public.personas (id, family_id, created_by_member_id, kind, display_name, status)
  VALUES (
    v_reservation.persona_id, v_reservation.family_id, v_reservation.member_id,
    v_reservation.kind, v_reservation.display_name, 'training'
  );

  IF v_reservation.baby_id IS NOT NULL THEN
    INSERT INTO public.babies (id, family_id, display_name, birth_date, roster_group_id, roster_scope, is_default)
    VALUES (
      v_reservation.baby_id,
      v_reservation.family_id,
      v_reservation.baby->>'displayName',
      NULLIF(v_reservation.baby->>'birthDate', '')::date,
      gen_random_uuid(),
      COALESCE(v_reservation.baby->>'rosterScope', 'shared'),
      NOT EXISTS (SELECT 1 FROM public.babies baby WHERE baby.family_id = v_reservation.family_id)
    );
  END IF;

  IF v_reservation.bond_id IS NOT NULL THEN
    INSERT INTO public.baby_person_bonds (id, baby_id, persona_id, relationship, baby_calls_them, they_call_baby)
    VALUES (
      v_reservation.bond_id, v_reservation.baby_id, v_reservation.persona_id,
      v_reservation.bond->>'relationship', v_reservation.bond->>'babyCallsThem',
      v_reservation.bond->>'theyCallBaby'
    );
  END IF;

  UPDATE public.consent_receipts receipt
  SET subject_persona_id = v_reservation.persona_id
  WHERE receipt.id = CASE
      WHEN v_reservation.kind = 'baby' THEN v_reservation.baby_consent_receipt_id
      ELSE v_reservation.adult_consent_receipt_id
    END
    AND receipt.family_id = v_reservation.family_id
    AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = v_reservation.persona_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserved Persona consent receipt is unavailable';
  END IF;

  v_outbox_id := gen_random_uuid();
  INSERT INTO public.persona_creation_outbox (id, family_id, reservation_id, event_type, payload)
  VALUES (
    v_outbox_id,
    v_reservation.family_id,
    v_reservation.id,
    'persona-creation-finalized',
    jsonb_build_object(
      'eventId', v_outbox_id,
      'familyId', v_reservation.family_id,
      'personaId', v_reservation.persona_id,
      'reservationId', v_reservation.id
    )
  );

  UPDATE public.persona_creation_reservations reservation
  SET state = 'finalized', finalized_at = now(),
      upload_lease_expires_at = now() + interval '10 minutes'
  WHERE reservation.id = v_reservation.id;
  RETURN QUERY SELECT v_reservation.id, 'finalized'::text, v_outbox_id;
END
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

-- The callback route uses the service-role client. Keep every callback RPC
-- closed to ordinary callers, including the new seven-argument completion
-- overload introduced above.
REVOKE ALL ON FUNCTION app_claim_fal_training_callback(text, text, integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app_claim_fal_training_callback(text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION app_complete_fal_training_callback(text, text, text, text, text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app_complete_fal_training_callback(text, text, text, text, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION app_release_fal_training_callback(text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app_release_fal_training_callback(text, text) TO service_role;
