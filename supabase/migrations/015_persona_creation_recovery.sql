-- LUL-130: retryable reservation cleanup, leased outbox dispatch, and finalization revalidation.
-- Migration 014 is already published; this file only moves the protocol forward.

ALTER TABLE persona_creation_reservations
  ADD COLUMN IF NOT EXISTS blob_cleanup_completed_at timestamptz;

CREATE OR REPLACE FUNCTION app_finalize_persona_creation(p_reservation_id uuid)
RETURNS TABLE (id uuid, state text, outbox_event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation persona_creation_reservations%ROWTYPE;
  v_member members%ROWTYPE;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_reservation
  FROM persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
    AND reservation.family_id = app_current_family_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation reservation not found';
  END IF;
  IF v_reservation.state = 'finalized' THEN
    SELECT outbox.id INTO v_outbox_id
    FROM persona_creation_outbox outbox
    WHERE outbox.reservation_id = v_reservation.id;
    RETURN QUERY SELECT v_reservation.id, v_reservation.state, v_outbox_id;
    RETURN;
  END IF;
  IF v_reservation.state <> 'uploaded' THEN
    RAISE EXCEPTION 'Persona creation reservation is not ready to finalize';
  END IF;
  IF v_reservation.expires_at <= now() THEN
    UPDATE persona_creation_reservations reservation SET state = 'expired' WHERE reservation.id = v_reservation.id;
    RAISE EXCEPTION 'Persona creation reservation has expired';
  END IF;

  SELECT * INTO v_member FROM members member WHERE member.id = v_reservation.member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation Member not found';
  END IF;
  IF v_reservation.kind = 'baby' THEN
    IF v_member.role <> 'guardian' OR NOT EXISTS (
      SELECT 1 FROM consent_receipts receipt
      WHERE receipt.family_id = v_reservation.family_id
        AND receipt.member_id = v_reservation.member_id
        AND receipt.jurisdiction = v_member.jurisdiction
        AND receipt.status = 'verified'
        AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'Verified jurisdictional Baby consent is required to finalize';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM consent_receipts receipt
    WHERE receipt.id = v_reservation.adult_consent_receipt_id
      AND receipt.family_id = v_reservation.family_id
      AND receipt.subject_member_id = v_reservation.member_id
      AND receipt.jurisdiction = v_member.jurisdiction
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Verified subject-linked Adult consent is required to finalize';
  END IF;

  INSERT INTO personas (id, family_id, created_by_member_id, kind, display_name, status)
  VALUES (
    v_reservation.persona_id, v_reservation.family_id, v_reservation.member_id,
    v_reservation.kind, v_reservation.display_name, 'training'
  );

  IF v_reservation.baby_id IS NOT NULL THEN
    INSERT INTO babies (id, family_id, display_name, birth_date, roster_group_id, roster_scope, is_default)
    VALUES (
      v_reservation.baby_id,
      v_reservation.family_id,
      v_reservation.baby->>'displayName',
      NULLIF(v_reservation.baby->>'birthDate', '')::date,
      gen_random_uuid(),
      COALESCE(v_reservation.baby->>'rosterScope', 'shared'),
      NOT EXISTS (SELECT 1 FROM babies baby WHERE baby.family_id = v_reservation.family_id)
    );
  END IF;

  IF v_reservation.bond_id IS NOT NULL THEN
    INSERT INTO baby_person_bonds (id, baby_id, persona_id, relationship, baby_calls_them, they_call_baby)
    VALUES (
      v_reservation.bond_id, v_reservation.baby_id, v_reservation.persona_id,
      v_reservation.bond->>'relationship', v_reservation.bond->>'babyCallsThem',
      v_reservation.bond->>'theyCallBaby'
    );
  END IF;

  IF v_reservation.kind = 'adult' THEN
    UPDATE consent_receipts receipt
    SET subject_persona_id = v_reservation.persona_id
    WHERE receipt.id = v_reservation.adult_consent_receipt_id
      AND receipt.family_id = v_reservation.family_id
      AND receipt.subject_member_id = v_reservation.member_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subject-linked Adult consent receipt is unavailable';
    END IF;
  END IF;

  v_outbox_id := gen_random_uuid();
  INSERT INTO persona_creation_outbox (id, family_id, reservation_id, event_type, payload)
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

  UPDATE persona_creation_reservations reservation
  SET state = 'finalized', finalized_at = now()
  WHERE reservation.id = v_reservation.id;
  RETURN QUERY SELECT v_reservation.id, 'finalized'::text, v_outbox_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_claim_expired_persona_creation_reservations()
RETURNS TABLE (id uuid, family_id uuid, photo_keys jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE persona_creation_reservations reservation
  SET state = 'expired'
  WHERE reservation.family_id = app_current_family_id()
    AND reservation.blob_cleanup_completed_at IS NULL
    AND (
      (reservation.state IN ('prepared', 'uploaded') AND reservation.expires_at <= now())
      OR reservation.state = 'expired'
    )
  RETURNING reservation.id, reservation.family_id, reservation.photo_keys;
END;
$$;

CREATE OR REPLACE FUNCTION app_complete_persona_creation_expired_cleanup(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE persona_creation_reservations reservation
  SET blob_cleanup_completed_at = now()
  WHERE reservation.id = p_reservation_id
    AND reservation.family_id = app_current_family_id()
    AND reservation.state = 'expired';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expired Persona creation reservation not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_claim_persona_creation_outbox(p_lease_seconds integer DEFAULT 60)
RETURNS TABLE (id uuid, family_id uuid, reservation_id uuid, persona_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lease_seconds < 0 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Outbox lease must be between 0 and 300 seconds';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT outbox.id
    FROM persona_creation_outbox outbox
    WHERE outbox.family_id = app_current_family_id()
      AND (outbox.status = 'queued' OR (outbox.status = 'leased' AND outbox.lease_expires_at <= now()))
    ORDER BY outbox.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE persona_creation_outbox outbox
  SET status = 'leased',
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempts = outbox.attempts + 1
  FROM candidate, persona_creation_reservations reservation
  WHERE outbox.id = candidate.id
    AND reservation.id = outbox.reservation_id
    AND reservation.state = 'finalized'
  RETURNING outbox.id, outbox.family_id, outbox.reservation_id, reservation.persona_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_mark_persona_creation_outbox_sent(p_outbox_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE persona_creation_outbox outbox
  SET status = 'sent', lease_expires_at = NULL, sent_at = COALESCE(sent_at, now())
  WHERE outbox.id = p_outbox_id
    AND outbox.family_id = app_current_family_id()
    AND outbox.status = 'leased';
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM persona_creation_outbox outbox
    WHERE outbox.id = p_outbox_id
      AND outbox.family_id = app_current_family_id()
      AND outbox.status = 'sent'
  ) THEN
    RAISE EXCEPTION 'Persona creation outbox lease not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_claim_expired_persona_creation_reservations() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_complete_persona_creation_expired_cleanup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_claim_persona_creation_outbox(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_mark_persona_creation_outbox_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_claim_expired_persona_creation_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION app_complete_persona_creation_expired_cleanup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_claim_persona_creation_outbox(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app_mark_persona_creation_outbox_sent(uuid) TO authenticated;
