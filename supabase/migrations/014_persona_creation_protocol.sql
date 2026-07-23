-- LUL-130: database-authoritative Persona creation reservation and outbox protocol.
-- Source photos never enter PostgreSQL; only creation-scoped keys and their
-- SHA-256/size manifests are persisted after moderation has passed.

ALTER TABLE consent_receipts
  ADD COLUMN IF NOT EXISTS subject_member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_persona_id uuid REFERENCES personas(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS persona_creation_reservations (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  request_fingerprint text NOT NULL,
  persona_id uuid NOT NULL UNIQUE,
  baby_id uuid UNIQUE,
  bond_id uuid UNIQUE,
  adult_consent_receipt_id uuid REFERENCES consent_receipts(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('baby', 'adult')),
  display_name text NOT NULL,
  baby jsonb,
  bond jsonb,
  photo_keys jsonb NOT NULL,
  photo_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL CHECK (state IN ('prepared', 'uploaded', 'finalized', 'aborted', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (family_id, request_fingerprint)
);

CREATE INDEX IF NOT EXISTS persona_creation_reservations_family_state_idx
  ON persona_creation_reservations (family_id, state, expires_at);

CREATE TABLE IF NOT EXISTS persona_creation_outbox (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL UNIQUE REFERENCES persona_creation_reservations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'leased', 'sent', 'failed')) DEFAULT 'queued',
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE persona_creation_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_creation_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persona reservations visible within family"
  ON persona_creation_reservations FOR SELECT
  USING (family_id = app_current_family_id());

CREATE POLICY "persona outbox visible within family"
  ON persona_creation_outbox FOR SELECT
  USING (family_id = app_current_family_id());

CREATE OR REPLACE FUNCTION app_prepare_persona_creation(
  p_kind text,
  p_display_name text,
  p_photo_count integer,
  p_request_fingerprint text,
  p_baby jsonb DEFAULT NULL,
  p_bond jsonb DEFAULT NULL,
  p_adult_consent_receipt_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, family_id uuid, state text, photo_keys jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
  v_existing persona_creation_reservations%ROWTYPE;
  v_reservation_id uuid := gen_random_uuid();
  v_persona_id uuid := gen_random_uuid();
  v_baby_id uuid;
  v_bond_id uuid;
  v_photo_keys jsonb;
  v_capacity integer;
BEGIN
  IF p_kind NOT IN ('baby', 'adult') THEN
    RAISE EXCEPTION 'Unsupported Persona kind';
  END IF;
  IF p_photo_count < 1 OR p_photo_count > 20 THEN
    RAISE EXCEPTION 'Photo count must be between 1 and 20';
  END IF;
  IF length(trim(p_display_name)) = 0 OR length(p_request_fingerprint) <> 64 THEN
    RAISE EXCEPTION 'Invalid Persona creation reservation';
  END IF;

  SELECT * INTO v_member FROM members WHERE auth_user_id = auth.uid() FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated Member not found';
  END IF;

  SELECT * INTO v_existing
    FROM persona_creation_reservations reservation
    WHERE reservation.family_id = v_member.family_id
      AND reservation.request_fingerprint = p_request_fingerprint;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.family_id, v_existing.state, v_existing.photo_keys;
    RETURN;
  END IF;

  IF p_bond IS NOT NULL AND p_baby IS NULL THEN
    RAISE EXCEPTION 'A Baby is required when reserving a bond';
  END IF;
  IF p_baby IS NOT NULL THEN
    v_baby_id := gen_random_uuid();
    IF p_bond IS NOT NULL THEN
      v_bond_id := gen_random_uuid();
    END IF;
  END IF;

  IF p_kind = 'baby' THEN
    IF v_member.role <> 'guardian' THEN
      RAISE EXCEPTION 'Only Guardians may reserve a Baby Persona';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM consent_receipts receipt
      WHERE receipt.family_id = v_member.family_id
        AND receipt.member_id = v_member.id
        AND receipt.jurisdiction = v_member.jurisdiction
        AND receipt.status = 'verified'
        AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'Verified jurisdictional Baby consent is required';
    END IF;
    IF p_baby IS NULL THEN
      RAISE EXCEPTION 'Baby Persona reservation requires Baby data';
    END IF;
  ELSE
    IF p_adult_consent_receipt_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM consent_receipts receipt
      WHERE receipt.id = p_adult_consent_receipt_id
        AND receipt.family_id = v_member.family_id
        AND receipt.subject_member_id = v_member.id
        AND receipt.jurisdiction = v_member.jurisdiction
        AND receipt.status = 'verified'
        AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'Verified subject-linked Adult consent is required';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_member.family_id::text));
  SELECT count(*) INTO v_capacity
    FROM personas persona
    WHERE persona.family_id = v_member.family_id;
  SELECT v_capacity + count(*) INTO v_capacity
    FROM persona_creation_reservations reservation
    WHERE reservation.family_id = v_member.family_id AND reservation.state IN ('prepared', 'uploaded');
  IF v_capacity >= 3 THEN
    RAISE EXCEPTION 'Persona capacity has been reached';
  END IF;

  SELECT jsonb_agg(
    format('persona-creation/%s/%s/photos/%s.jpg', v_member.family_id, v_reservation_id, photo_index)
  ) INTO v_photo_keys
  FROM generate_series(0, p_photo_count - 1) AS photo_index;

  INSERT INTO persona_creation_reservations (
    id, family_id, member_id, request_fingerprint, persona_id, baby_id, bond_id,
    adult_consent_receipt_id, kind, display_name, baby, bond, photo_keys, state, expires_at
  ) VALUES (
    v_reservation_id, v_member.family_id, v_member.id, p_request_fingerprint, v_persona_id,
    v_baby_id, v_bond_id, p_adult_consent_receipt_id, p_kind, p_display_name, p_baby,
    p_bond, v_photo_keys, 'prepared', now() + interval '30 minutes'
  );

  RETURN QUERY SELECT v_reservation_id, v_member.family_id, 'prepared'::text, v_photo_keys;
END;
$$;

REVOKE ALL ON FUNCTION app_prepare_persona_creation(text, text, integer, text, jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_prepare_persona_creation(text, text, integer, text, jsonb, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_mark_persona_creation_uploaded(
  p_reservation_id uuid,
  p_photo_manifest jsonb
)
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
  IF v_reservation.state = 'uploaded' AND v_reservation.photo_manifest = p_photo_manifest THEN
    RETURN QUERY SELECT v_reservation.id, v_reservation.state;
    RETURN;
  END IF;
  IF v_reservation.state <> 'prepared' THEN
    RAISE EXCEPTION 'Persona creation reservation is not ready for upload';
  END IF;
  IF v_reservation.expires_at <= now() THEN
    UPDATE persona_creation_reservations reservation SET state = 'expired' WHERE reservation.id = v_reservation.id;
    RAISE EXCEPTION 'Persona creation reservation has expired';
  END IF;
  IF jsonb_typeof(p_photo_manifest) <> 'array'
    OR jsonb_array_length(p_photo_manifest) <> jsonb_array_length(v_reservation.photo_keys)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_photo_manifest) manifest
      WHERE jsonb_typeof(manifest) <> 'object'
        OR NOT (manifest ? 'key' AND manifest ? 'sha256' AND manifest ? 'size')
        OR manifest->>'sha256' !~ '^[0-9a-f]{64}$'
        OR (manifest->>'size') !~ '^[1-9][0-9]*$'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_reservation.photo_keys) expected_key
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_photo_manifest) manifest
        WHERE manifest->>'key' = expected_key
      )
    ) THEN
    RAISE EXCEPTION 'Invalid Persona creation photo manifest';
  END IF;

  UPDATE persona_creation_reservations reservation
  SET photo_manifest = p_photo_manifest, state = 'uploaded'
  WHERE reservation.id = v_reservation.id;
  RETURN QUERY SELECT v_reservation.id, 'uploaded'::text;
END;
$$;

CREATE OR REPLACE FUNCTION app_finalize_persona_creation(p_reservation_id uuid)
RETURNS TABLE (id uuid, state text, outbox_event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation persona_creation_reservations%ROWTYPE;
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

REVOKE ALL ON FUNCTION app_mark_persona_creation_uploaded(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_finalize_persona_creation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mark_persona_creation_uploaded(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION app_finalize_persona_creation(uuid) TO authenticated;

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

REVOKE ALL ON FUNCTION app_abort_persona_creation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_abort_persona_creation(uuid) TO authenticated;
