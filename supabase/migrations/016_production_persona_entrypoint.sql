-- LUL-103: record Adult subject consent and reserve Persona creation in one
-- authenticated database transaction. The web form's checkbox is never a
-- substitute for a durable receipt: calling this RPC creates the receipt and
-- passes its immutable ID to the existing reservation function atomically.

CREATE OR REPLACE FUNCTION app_prepare_adult_persona_creation(
  p_display_name text,
  p_photo_count integer,
  p_request_fingerprint text
)
RETURNS TABLE (id uuid, family_id uuid, state text, photo_keys jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
  v_existing persona_creation_reservations%ROWTYPE;
  v_receipt_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_member
  FROM members
  WHERE auth_user_id = auth.uid()
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated Member not found';
  END IF;
  IF v_member.role <> 'guardian' THEN
    RAISE EXCEPTION 'Only Guardians may reserve an Adult Persona';
  END IF;

  SELECT * INTO v_existing
  FROM persona_creation_reservations reservation
  WHERE reservation.family_id = v_member.family_id
    AND reservation.request_fingerprint = p_request_fingerprint;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.family_id, v_existing.state, v_existing.photo_keys;
    RETURN;
  END IF;

  INSERT INTO consent_receipts (
    id, family_id, member_id, subject_member_id, jurisdiction,
    notice_version, method, status
  ) VALUES (
    v_receipt_id, v_member.family_id, v_member.id, v_member.id,
    v_member.jurisdiction, 'r1-adult-persona-v1', 'signed_form', 'verified'
  );

  RETURN QUERY
  SELECT * FROM app_prepare_persona_creation(
    'adult', p_display_name, p_photo_count, p_request_fingerprint,
    NULL, NULL, v_receipt_id
  );
END;
$$;

-- A reservation-created signed form receipt has no purpose if its reservation
-- never commits. Abort deletes it in the same transaction as the state change.
CREATE OR REPLACE FUNCTION app_abort_persona_creation(p_reservation_id uuid)
RETURNS TABLE (id uuid, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation persona_creation_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation
  FROM persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
    AND reservation.family_id = app_current_family_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation reservation not found';
  END IF;
  IF v_reservation.state IN ('prepared', 'uploaded') THEN
    UPDATE persona_creation_reservations reservation
    SET state = 'aborted'
    WHERE reservation.id = v_reservation.id;
    IF v_reservation.adult_consent_receipt_id IS NOT NULL THEN
      DELETE FROM consent_receipts receipt
      WHERE receipt.id = v_reservation.adult_consent_receipt_id
        AND receipt.subject_persona_id IS NULL
        AND receipt.method = 'signed_form';
    END IF;
    RETURN QUERY SELECT v_reservation.id, 'aborted'::text;
    RETURN;
  END IF;
  IF v_reservation.state = 'aborted' THEN
    RETURN QUERY SELECT v_reservation.id, v_reservation.state;
    RETURN;
  END IF;
  RAISE EXCEPTION 'Finalized or expired Persona creation cannot be aborted';
END;
$$;

REVOKE ALL ON FUNCTION app_prepare_adult_persona_creation(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_prepare_adult_persona_creation(text, integer, text) TO authenticated;

-- The request may only dispatch the outbox event it just finalized. It must
-- never acknowledge a different queued creation in the same Family.
CREATE OR REPLACE FUNCTION app_claim_persona_creation_outbox_for_reservation(
  p_reservation_id uuid,
  p_lease_seconds integer DEFAULT 60
)
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
  UPDATE persona_creation_outbox outbox
  SET status = 'leased',
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempts = outbox.attempts + 1
  FROM persona_creation_reservations reservation
  WHERE outbox.reservation_id = p_reservation_id
    AND outbox.reservation_id = reservation.id
    AND outbox.family_id = app_current_family_id()
    AND reservation.state = 'finalized'
    AND (outbox.status = 'queued' OR (outbox.status = 'leased' AND outbox.lease_expires_at <= now()))
  RETURNING outbox.id, outbox.family_id, outbox.reservation_id, reservation.persona_id;
END;
$$;

REVOKE ALL ON FUNCTION app_claim_persona_creation_outbox_for_reservation(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_claim_persona_creation_outbox_for_reservation(uuid, integer) TO authenticated;
