-- LUL-130: harden the published 014-016 Persona creation protocol without
-- rewriting migration history. Authenticated clients may prepare/cancel their
-- own reservation; only service-role workers may attest upload completion,
-- finalize domain rows, clean blobs, or dispatch the durable outbox.

ALTER TABLE public.persona_creation_reservations
  ADD COLUMN IF NOT EXISTS baby_consent_receipt_id uuid REFERENCES public.consent_receipts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS owns_adult_consent_receipt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upload_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS upload_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_lease_token uuid,
  ADD COLUMN IF NOT EXISTS cleanup_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleanup_quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_quarantine_reason text,
  ADD COLUMN IF NOT EXISTS remediation_reason text;

ALTER TABLE public.persona_creation_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid;

-- Consent receipts are authoritative safety evidence. Ordinary authenticated
-- clients may inspect their Family's receipts, but only trusted server paths
-- (service role or narrowly-scoped SECURITY DEFINER functions) may issue or
-- mutate them.
DROP POLICY IF EXISTS "guardian records consent" ON public.consent_receipts;
DROP POLICY IF EXISTS "ticket184 consent isolation" ON public.consent_receipts;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.consent_receipts FROM PUBLIC, authenticated;
GRANT SELECT ON TABLE public.consent_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consent_receipts TO service_role;

CREATE TABLE IF NOT EXISTS public.persona_creation_upload_attempts (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.persona_creation_reservations(id) ON DELETE CASCADE,
  photo_keys jsonb NOT NULL,
  photo_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('leased', 'accepted')) DEFAULT 'leased',
  lease_expires_at timestamptz NOT NULL,
  cleanup_lease_token uuid,
  cleanup_lease_expires_at timestamptz,
  cleanup_attempts integer NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  cleanup_quarantined_at timestamptz,
  cleanup_quarantine_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, id),
  CHECK (
    (cleanup_lease_token IS NULL AND cleanup_lease_expires_at IS NULL)
    OR (cleanup_lease_token IS NOT NULL AND cleanup_lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS persona_creation_upload_attempts_cleanup_idx
  ON public.persona_creation_upload_attempts (status, lease_expires_at, created_at);

ALTER TABLE public.persona_creation_upload_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "persona upload attempts visible within family" ON public.persona_creation_upload_attempts;
CREATE POLICY "persona upload attempts visible within family"
  ON public.persona_creation_upload_attempts FOR SELECT
  USING (family_id = public.app_current_family_id());

-- Replace published worker signatures rather than leave callable legacy
-- overloads behind. These functions have no table/view dependencies.
DROP FUNCTION IF EXISTS public.app_mark_persona_creation_uploaded(uuid, jsonb);
DROP FUNCTION IF EXISTS public.app_claim_expired_persona_creation_reservations();
DROP FUNCTION IF EXISTS public.app_complete_persona_creation_expired_cleanup(uuid);
DROP FUNCTION IF EXISTS public.app_claim_persona_creation_outbox(integer);
DROP FUNCTION IF EXISTS public.app_claim_persona_creation_outbox_for_reservation(uuid, integer);
DROP FUNCTION IF EXISTS public.app_mark_persona_creation_outbox_sent(uuid);
DROP FUNCTION IF EXISTS public.app_quarantine_invalid_persona_creation_outbox();

-- Migration 016 did not persist whether its generated Adult receipt was owned
-- by the reservation. Do not infer ownership from mutable method/notice fields:
-- pre-017 rows remain non-owned and therefore can never cause receipt deletion.
-- New rows from app_prepare_adult_persona_creation set the bit transactionally.

-- R1 supports the US web and US iOS consent paths only. Keep the database's
-- prepare, retry, trigger, upgrade, and finalize checks on one exact mapping so
-- a receipt from one channel can never satisfy the other channel's gate.
CREATE OR REPLACE FUNCTION public.app_persona_creation_baby_consent_is_canonical(
  p_jurisdiction text,
  p_method text,
  p_notice_version text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_jurisdiction
    WHEN 'US' THEN
      p_method IS NOT DISTINCT FROM 'payment_vpc'
      AND p_notice_version IS NOT DISTINCT FROM 'us-coppa-v1'
    WHEN 'US_IOS' THEN
      p_method IS NOT DISTINCT FROM 'email_plus'
      AND p_notice_version IS NOT DISTINCT FROM 'us-coppa-v1'
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.app_persona_creation_baby_consent_is_canonical(text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.app_persona_creation_baby_reservation_consent_is_valid(
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.persona_creation_reservations reservation
    JOIN public.members member
      ON member.id = reservation.member_id
     AND member.family_id = reservation.family_id
    JOIN public.consent_receipts receipt
      ON receipt.id = reservation.baby_consent_receipt_id
     AND receipt.family_id = reservation.family_id
     AND receipt.member_id = reservation.member_id
    WHERE reservation.id = p_reservation_id
      AND reservation.kind = 'baby'
      AND member.role = 'guardian'
      AND receipt.subject_member_id IS NULL
      AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = reservation.persona_id)
      AND receipt.jurisdiction = member.jurisdiction
      AND public.app_persona_creation_baby_consent_is_canonical(
        receipt.jurisdiction, receipt.method, receipt.notice_version
      )
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
  )
$$;

REVOKE ALL ON FUNCTION public.app_persona_creation_baby_reservation_consent_is_valid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_persona_creation_baby_reservation_consent_is_valid(uuid) TO service_role;

-- Migration 016 let any authenticated Member prepare, attest, and finalize an
-- Adult Persona. Forward-remediate those already-finalized non-Guardian rows:
-- block dispatch immediately, make the Persona non-trainable, and retain the
-- reservation plus source keys until the normal leased cleanup completes.
WITH unsafe AS (
  SELECT reservation.id
  FROM public.persona_creation_reservations reservation
  JOIN public.members member
    ON member.id = reservation.member_id
   AND member.family_id = reservation.family_id
  WHERE reservation.kind = 'adult'
    AND reservation.state = 'finalized'
    AND member.role <> 'guardian'
)
UPDATE public.persona_creation_outbox outbox
SET status = 'failed', lease_expires_at = NULL, lease_token = NULL
FROM unsafe
WHERE outbox.reservation_id = unsafe.id;

WITH unsafe AS (
  SELECT reservation.persona_id
  FROM public.persona_creation_reservations reservation
  JOIN public.members member
    ON member.id = reservation.member_id
   AND member.family_id = reservation.family_id
  WHERE reservation.kind = 'adult'
    AND reservation.state = 'finalized'
    AND member.role <> 'guardian'
)
UPDATE public.personas persona
SET status = 'failed'
FROM unsafe
WHERE persona.id = unsafe.persona_id;

UPDATE public.persona_creation_reservations reservation
SET state = 'aborted',
    remediation_reason = 'legacy_non_guardian_adult_finalization'
FROM public.members member
WHERE member.id = reservation.member_id
  AND member.family_id = reservation.family_id
  AND member.role <> 'guardian'
  AND reservation.kind = 'adult'
  AND reservation.state = 'finalized';

-- Backfill every active or finalized legacy Baby reservation only when one and
-- only one still-valid canonical jurisdictional receipt can be identified in
-- both directions. Ambiguous rows are blocked rather than guessed into a
-- consent association.
WITH candidate_pairs AS (
  SELECT reservation.id AS reservation_id, receipt.id AS receipt_id
  FROM public.persona_creation_reservations reservation
  JOIN public.members member
    ON member.id = reservation.member_id
   AND member.family_id = reservation.family_id
  JOIN public.consent_receipts receipt
    ON receipt.family_id = reservation.family_id
   AND receipt.member_id = reservation.member_id
   AND receipt.jurisdiction = member.jurisdiction
   AND public.app_persona_creation_baby_consent_is_canonical(
     receipt.jurisdiction, receipt.method, receipt.notice_version
   )
   AND receipt.status = 'verified'
   AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
   AND receipt.subject_member_id IS NULL
   AND receipt.subject_persona_id IS NULL
  WHERE reservation.kind = 'baby'
    AND reservation.state IN ('prepared', 'uploaded', 'finalized')
    AND member.role = 'guardian'
    AND reservation.baby_consent_receipt_id IS NULL
), unique_reservations AS (
  SELECT reservation_id, min(receipt_id::text)::uuid AS receipt_id
  FROM candidate_pairs
  GROUP BY reservation_id
  HAVING count(*) = 1
), unique_receipts AS (
  SELECT receipt_id, min(reservation_id::text)::uuid AS reservation_id
  FROM candidate_pairs
  GROUP BY receipt_id
  HAVING count(*) = 1
), eligible AS (
  SELECT reservation.reservation_id, reservation.receipt_id
  FROM unique_reservations reservation
  JOIN unique_receipts receipt
    ON receipt.receipt_id = reservation.receipt_id
   AND receipt.reservation_id = reservation.reservation_id
)
UPDATE public.persona_creation_reservations reservation
SET baby_consent_receipt_id = eligible.receipt_id
FROM eligible
WHERE reservation.id = eligible.reservation_id;

WITH unsafe AS (
  SELECT reservation.id
  FROM public.persona_creation_reservations reservation
  WHERE reservation.kind = 'baby'
    AND reservation.state = 'finalized'
    AND reservation.baby_consent_receipt_id IS NULL
)
UPDATE public.persona_creation_outbox outbox
SET status = 'failed', lease_expires_at = NULL, lease_token = NULL
FROM unsafe
WHERE outbox.reservation_id = unsafe.id;

WITH unsafe AS (
  SELECT reservation.persona_id
  FROM public.persona_creation_reservations reservation
  WHERE reservation.kind = 'baby'
    AND reservation.state = 'finalized'
    AND reservation.baby_consent_receipt_id IS NULL
)
UPDATE public.personas persona
SET status = 'failed'
FROM unsafe
WHERE persona.id = unsafe.persona_id;

UPDATE public.persona_creation_reservations reservation
SET state = 'aborted',
    remediation_reason = 'legacy_baby_consent_unresolved'
WHERE reservation.kind = 'baby'
  AND reservation.state = 'finalized'
  AND reservation.baby_consent_receipt_id IS NULL;

UPDATE public.persona_creation_reservations reservation
SET state = 'aborted'
WHERE reservation.kind = 'baby'
  AND reservation.state IN ('prepared', 'uploaded')
  AND reservation.baby_consent_receipt_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.persona_creation_reservations
    WHERE adult_consent_receipt_id IS NOT NULL
    GROUP BY adult_consent_receipt_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot harden Persona creation: an Adult consent receipt is claimed more than once';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.persona_creation_reservations
    WHERE baby_consent_receipt_id IS NOT NULL
    GROUP BY baby_consent_receipt_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot harden Persona creation: a Baby consent receipt is claimed more than once';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS persona_creation_reservations_adult_receipt_unique
  ON public.persona_creation_reservations (adult_consent_receipt_id)
  WHERE adult_consent_receipt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS persona_creation_reservations_baby_receipt_unique
  ON public.persona_creation_reservations (baby_consent_receipt_id)
  WHERE baby_consent_receipt_id IS NOT NULL;

ALTER TABLE public.persona_creation_reservations
  DROP CONSTRAINT IF EXISTS persona_creation_upload_lease_check,
  DROP CONSTRAINT IF EXISTS persona_creation_cleanup_lease_check,
  DROP CONSTRAINT IF EXISTS persona_creation_cleanup_attempts_check;

ALTER TABLE public.persona_creation_reservations
  ADD CONSTRAINT persona_creation_upload_lease_check CHECK (
    (upload_attempt_id IS NULL AND upload_lease_expires_at IS NULL)
    OR (upload_attempt_id IS NOT NULL AND upload_lease_expires_at IS NOT NULL)
  ),
  ADD CONSTRAINT persona_creation_cleanup_lease_check CHECK (
    (cleanup_lease_token IS NULL AND cleanup_lease_expires_at IS NULL)
    OR (cleanup_lease_token IS NOT NULL AND cleanup_lease_expires_at IS NOT NULL)
  ),
  ADD CONSTRAINT persona_creation_cleanup_attempts_check CHECK (
    cleanup_attempts >= 0
  );

-- Repair legacy lease shapes before adding the authoritative constraint. A
-- leased row with no expiry was never safely owned, so queue it for a fresh
-- claim. Non-leased rows never retain lease material.
UPDATE public.persona_creation_outbox
SET status = 'queued', lease_expires_at = NULL, lease_token = NULL
WHERE status = 'leased' AND lease_expires_at IS NULL;

UPDATE public.persona_creation_outbox
SET lease_expires_at = NULL, lease_token = NULL
WHERE status <> 'leased';

UPDATE public.persona_creation_outbox
SET lease_token = gen_random_uuid()
WHERE status = 'leased' AND lease_token IS NULL;

ALTER TABLE public.persona_creation_outbox
  DROP CONSTRAINT IF EXISTS persona_creation_outbox_lease_check;

ALTER TABLE public.persona_creation_outbox
  ADD CONSTRAINT persona_creation_outbox_lease_check CHECK (
    (status = 'leased' AND lease_expires_at IS NOT NULL AND lease_token IS NOT NULL)
    OR (status <> 'leased' AND lease_expires_at IS NULL AND lease_token IS NULL)
  );

CREATE OR REPLACE FUNCTION public.app_persona_creation_keys_are_scoped(
  p_family_id uuid,
  p_reservation_id uuid,
  p_photo_keys jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_typeof(p_photo_keys) = 'array'
    AND jsonb_array_length(p_photo_keys) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_photo_keys) value
      WHERE jsonb_typeof(value) <> 'string'
         OR value #>> '{}' !~ (
           '^persona-creation/' || p_family_id::text || '/' || p_reservation_id::text || '/(attempts/[0-9a-f-]+/)?photos/[0-9]+[.]jpg$'
         )
    )
$$;

REVOKE ALL ON FUNCTION public.app_persona_creation_keys_are_scoped(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_persona_creation_keys_are_scoped(uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.app_persona_creation_attempt_keys_are_scoped(
  p_family_id uuid,
  p_reservation_id uuid,
  p_attempt_id uuid,
  p_photo_keys jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_typeof(p_photo_keys) = 'array'
    AND jsonb_array_length(p_photo_keys) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_photo_keys) value
      WHERE jsonb_typeof(value) <> 'string'
         OR value #>> '{}' !~ (
           '^persona-creation/' || p_family_id::text || '/' || p_reservation_id::text
           || '/attempts/' || p_attempt_id::text || '/photos/[0-9]+[.]jpg$'
         )
    )
$$;

REVOKE ALL ON FUNCTION public.app_persona_creation_attempt_keys_are_scoped(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_persona_creation_attempt_keys_are_scoped(uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.app_validate_persona_creation_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.kind = 'adult' THEN
    IF NEW.adult_consent_receipt_id IS NULL OR NEW.baby_consent_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Adult Persona creation requires exactly one Adult consent receipt';
    END IF;
    PERFORM 1
    FROM public.consent_receipts receipt
    WHERE receipt.id = NEW.adult_consent_receipt_id
      AND receipt.family_id = NEW.family_id
      AND receipt.member_id = NEW.member_id
      AND receipt.subject_member_id = NEW.member_id
      AND receipt.subject_persona_id IS NULL
      AND receipt.method = 'signed_form'
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Adult consent receipt is invalid, already linked, or reserved for another purpose';
    END IF;
  ELSE
    IF NEW.baby_consent_receipt_id IS NULL OR NEW.adult_consent_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Baby Persona creation requires exactly one canonical jurisdictional consent receipt';
    END IF;
    PERFORM 1
    FROM public.consent_receipts receipt
    JOIN public.members member
      ON member.id = NEW.member_id
     AND member.family_id = NEW.family_id
     AND member.jurisdiction = receipt.jurisdiction
    WHERE receipt.id = NEW.baby_consent_receipt_id
      AND receipt.family_id = NEW.family_id
      AND receipt.member_id = NEW.member_id
      AND receipt.subject_member_id IS NULL
      AND receipt.subject_persona_id IS NULL
      AND public.app_persona_creation_baby_consent_is_canonical(
        receipt.jurisdiction, receipt.method, receipt.notice_version
      )
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    FOR UPDATE OF receipt;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Canonical Baby consent receipt is invalid, linked, or reserved for another purpose';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.app_validate_persona_creation_reservation() FROM PUBLIC;
DROP TRIGGER IF EXISTS persona_creation_consent_guard ON public.persona_creation_reservations;
DROP TRIGGER IF EXISTS persona_creation_adult_receipt_guard ON public.persona_creation_reservations;
CREATE TRIGGER persona_creation_consent_guard
  BEFORE INSERT ON public.persona_creation_reservations
  FOR EACH ROW EXECUTE FUNCTION public.app_validate_persona_creation_reservation();

CREATE OR REPLACE FUNCTION public.app_prepare_persona_creation(
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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.members%ROWTYPE;
  v_existing public.persona_creation_reservations%ROWTYPE;
  v_reservation_id uuid := gen_random_uuid();
  v_persona_id uuid := gen_random_uuid();
  v_baby_id uuid;
  v_bond_id uuid;
  v_baby_consent_receipt_id uuid;
  v_photo_keys jsonb;
  v_capacity integer;
BEGIN
  IF p_kind NOT IN ('baby', 'adult') THEN
    RAISE EXCEPTION 'Unsupported Persona kind';
  END IF;
  IF p_photo_count IS NULL OR p_photo_count < 1 OR p_photo_count > 20 THEN
    RAISE EXCEPTION 'Photo count must be between 1 and 20';
  END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0
     OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Persona creation reservation';
  END IF;
  IF p_bond IS NOT NULL AND p_baby IS NULL THEN
    RAISE EXCEPTION 'A Baby is required when reserving a bond';
  END IF;
  IF p_baby IS NOT NULL AND (
    jsonb_typeof(p_baby) <> 'object'
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_baby) AS baby_keys(key)
      WHERE key NOT IN ('displayName', 'birthDate', 'rosterScope')
    )
    OR jsonb_typeof(p_baby->'displayName') <> 'string'
    OR length(trim(COALESCE(p_baby->>'displayName', ''))) = 0
    OR (
      p_baby ? 'birthDate'
      AND jsonb_typeof(p_baby->'birthDate') NOT IN ('string', 'null')
    )
    OR (
      p_baby ? 'rosterScope'
      AND jsonb_typeof(p_baby->'rosterScope') <> 'string'
    )
    OR COALESCE(p_baby->>'rosterScope', 'shared') NOT IN ('shared', 'isolated')
  ) THEN
    RAISE EXCEPTION 'Invalid Baby link data';
  END IF;
  IF p_bond IS NOT NULL AND (
    jsonb_typeof(p_bond) <> 'object'
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_bond) AS bond_keys(key)
      WHERE key NOT IN ('relationship', 'babyCallsThem', 'theyCallBaby')
    )
    OR jsonb_typeof(p_bond->'relationship') <> 'string'
    OR jsonb_typeof(p_bond->'babyCallsThem') <> 'string'
    OR jsonb_typeof(p_bond->'theyCallBaby') <> 'string'
    OR length(trim(COALESCE(p_bond->>'relationship', ''))) = 0
    OR length(trim(COALESCE(p_bond->>'babyCallsThem', ''))) = 0
    OR length(trim(COALESCE(p_bond->>'theyCallBaby', ''))) = 0
  ) THEN
    RAISE EXCEPTION 'Invalid Baby bond data';
  END IF;

  SELECT * INTO v_member
  FROM public.members member
  WHERE member.auth_user_id = auth.uid()
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated Member not found';
  END IF;
  IF v_member.role <> 'guardian' THEN
    RAISE EXCEPTION 'Guardian authority is required to reserve a Persona';
  END IF;

  -- Serialize same-Family fingerprint retries before checking the unique key.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_member.family_id::text || ':' || p_request_fingerprint, 0));

  SELECT * INTO v_existing
  FROM public.persona_creation_reservations reservation
  WHERE reservation.family_id = v_member.family_id
    AND reservation.request_fingerprint = p_request_fingerprint;
  IF FOUND THEN
    IF v_existing.kind IS DISTINCT FROM p_kind
      OR v_existing.display_name IS DISTINCT FROM trim(p_display_name)
      OR jsonb_array_length(v_existing.photo_keys) IS DISTINCT FROM p_photo_count
      OR v_existing.baby IS DISTINCT FROM p_baby
      OR v_existing.bond IS DISTINCT FROM p_bond
      OR (
        p_kind = 'adult'
        AND (
          p_adult_consent_receipt_id IS NULL
          OR v_existing.owns_adult_consent_receipt
          OR v_existing.adult_consent_receipt_id IS DISTINCT FROM p_adult_consent_receipt_id
          OR NOT EXISTS (
            SELECT 1 FROM public.consent_receipts receipt
            WHERE receipt.id = p_adult_consent_receipt_id
              AND receipt.family_id = v_existing.family_id
              AND receipt.member_id = v_existing.member_id
              AND receipt.subject_member_id = v_existing.member_id
              AND receipt.method = 'signed_form'
              AND receipt.status = 'verified'
              AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = v_existing.persona_id)
              AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
          )
        )
      )
      OR (
        p_kind = 'baby'
        AND (
          p_adult_consent_receipt_id IS NOT NULL
          OR v_existing.baby_consent_receipt_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM public.consent_receipts receipt
            WHERE receipt.id = v_existing.baby_consent_receipt_id
              AND receipt.family_id = v_existing.family_id
              AND receipt.member_id = v_existing.member_id
              AND receipt.jurisdiction = v_member.jurisdiction
              AND public.app_persona_creation_baby_consent_is_canonical(
                receipt.jurisdiction, receipt.method, receipt.notice_version
              )
              AND receipt.status = 'verified'
              AND (receipt.subject_persona_id IS NULL OR receipt.subject_persona_id = v_existing.persona_id)
              AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
          )
        )
      )
    THEN
      RAISE EXCEPTION 'Request fingerprint does not match the immutable Persona creation identity or exact consent mode';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.family_id, v_existing.state, v_existing.photo_keys;
    RETURN;
  END IF;

  IF p_baby IS NOT NULL THEN
    v_baby_id := gen_random_uuid();
    IF p_bond IS NOT NULL THEN
      v_bond_id := gen_random_uuid();
    END IF;
  END IF;

  IF p_kind = 'baby' THEN
    IF p_baby IS NULL OR p_adult_consent_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Baby Persona reservation requires Baby data and no Adult receipt';
    END IF;
    SELECT receipt.id INTO v_baby_consent_receipt_id
    FROM public.consent_receipts receipt
    WHERE receipt.family_id = v_member.family_id
      AND receipt.member_id = v_member.id
      AND receipt.jurisdiction = v_member.jurisdiction
      AND public.app_persona_creation_baby_consent_is_canonical(
        receipt.jurisdiction, receipt.method, receipt.notice_version
      )
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
      AND receipt.subject_member_id IS NULL
      AND receipt.subject_persona_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.persona_creation_reservations claimed
        WHERE claimed.baby_consent_receipt_id = receipt.id
      )
    ORDER BY receipt.consented_at DESC, receipt.id
    FOR UPDATE OF receipt
    LIMIT 1;
    IF v_baby_consent_receipt_id IS NULL THEN
      RAISE EXCEPTION 'An unused canonical jurisdictional Baby consent receipt is required';
    END IF;
  ELSE
    IF p_adult_consent_receipt_id IS NULL THEN
      RAISE EXCEPTION 'Verified subject-linked Adult consent is required';
    END IF;
    PERFORM 1
    FROM public.consent_receipts receipt
    WHERE receipt.id = p_adult_consent_receipt_id
      AND receipt.family_id = v_member.family_id
      AND receipt.member_id = v_member.id
      AND receipt.subject_member_id = v_member.id
      AND receipt.subject_persona_id IS NULL
      AND receipt.jurisdiction = v_member.jurisdiction
      AND receipt.method = 'signed_form'
      AND receipt.status = 'verified'
      AND (receipt.expires_at IS NULL OR receipt.expires_at > now())
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Verified unused subject-linked Adult consent is required';
    END IF;
  END IF;

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
    id, family_id, member_id, request_fingerprint, persona_id, baby_id, bond_id,
    adult_consent_receipt_id, baby_consent_receipt_id, kind, display_name,
    baby, bond, photo_keys, state, expires_at
  ) VALUES (
    v_reservation_id, v_member.family_id, v_member.id, p_request_fingerprint, v_persona_id,
    v_baby_id, v_bond_id, p_adult_consent_receipt_id, v_baby_consent_receipt_id,
    p_kind, trim(p_display_name), p_baby, p_bond, v_photo_keys, 'prepared', now() + interval '30 minutes'
  );

  RETURN QUERY SELECT v_reservation_id, v_member.family_id, 'prepared'::text, v_photo_keys;
END
$$;

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
  v_prepared record;
  v_receipt_id uuid := gen_random_uuid();
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
  IF v_member.role <> 'guardian' THEN
    RAISE EXCEPTION 'Guardian authority is required to reserve an Adult Persona';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_member.family_id::text || ':' || p_request_fingerprint, 0));
  SELECT * INTO v_existing
  FROM public.persona_creation_reservations reservation
  WHERE reservation.family_id = v_member.family_id
    AND reservation.request_fingerprint = p_request_fingerprint;
  IF FOUND THEN
    IF v_existing.kind IS DISTINCT FROM 'adult'
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

  SELECT * INTO v_prepared
  FROM public.app_prepare_persona_creation(
    'adult', p_display_name, p_photo_count, p_request_fingerprint,
    NULL, NULL, v_receipt_id
  );

  UPDATE public.persona_creation_reservations reservation
  SET owns_adult_consent_receipt = true
  WHERE reservation.id = v_prepared.id
    AND reservation.adult_consent_receipt_id = v_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adult Persona reservation did not retain its creation-owned consent receipt';
  END IF;

  RETURN QUERY SELECT v_prepared.id, v_prepared.family_id, v_prepared.state, v_prepared.photo_keys;
END
$$;

CREATE OR REPLACE FUNCTION public.app_claim_persona_creation_upload(
  p_reservation_id uuid,
  p_upload_attempt_id uuid,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (id uuid, family_id uuid, state text, photo_keys jsonb, upload_attempt_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reservation public.persona_creation_reservations%ROWTYPE;
  v_attempt public.persona_creation_upload_attempts%ROWTYPE;
  v_photo_keys jsonb;
BEGIN
  IF p_reservation_id IS NULL OR p_upload_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Reservation and upload attempt IDs are required';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'Upload lease must be between 1 and 600 seconds';
  END IF;

  SELECT * INTO v_reservation
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation reservation not found';
  END IF;
  IF v_reservation.state IN ('uploaded', 'finalized') AND v_reservation.upload_attempt_id = p_upload_attempt_id THEN
    RETURN QUERY SELECT v_reservation.id, v_reservation.family_id, v_reservation.state,
      v_reservation.photo_keys, v_reservation.upload_attempt_id;
    RETURN;
  END IF;
  IF v_reservation.state <> 'prepared' OR v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'Persona creation reservation is not available for upload';
  END IF;
  IF v_reservation.upload_attempt_id IS NOT NULL
    AND v_reservation.upload_attempt_id IS DISTINCT FROM p_upload_attempt_id
    AND v_reservation.upload_lease_expires_at > now() THEN
    RETURN;
  END IF;

  SELECT jsonb_agg(
    format(
      'persona-creation/%s/%s/attempts/%s/photos/%s.jpg',
      v_reservation.family_id, v_reservation.id, p_upload_attempt_id, photo_index
    ) ORDER BY photo_index
  ) INTO v_photo_keys
  FROM generate_series(0, jsonb_array_length(v_reservation.photo_keys) - 1) AS photo_index;

  INSERT INTO public.persona_creation_upload_attempts (
    id, family_id, reservation_id, photo_keys, lease_expires_at
  ) VALUES (
    p_upload_attempt_id, v_reservation.family_id, v_reservation.id, v_photo_keys,
    now() + make_interval(secs => p_lease_seconds)
  )
  ON CONFLICT ON CONSTRAINT persona_creation_upload_attempts_pkey DO UPDATE
  SET lease_expires_at = EXCLUDED.lease_expires_at
  WHERE persona_creation_upload_attempts.reservation_id = EXCLUDED.reservation_id
  RETURNING * INTO v_attempt;
  IF NOT FOUND
    OR v_attempt.reservation_id IS DISTINCT FROM v_reservation.id
    OR NOT public.app_persona_creation_attempt_keys_are_scoped(
      v_attempt.family_id, v_attempt.reservation_id, v_attempt.id, v_attempt.photo_keys
    )
  THEN
    RAISE EXCEPTION 'Persona creation upload attempt identity is invalid';
  END IF;

  UPDATE public.persona_creation_reservations reservation
  SET upload_attempt_id = p_upload_attempt_id,
      upload_lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  WHERE reservation.id = v_reservation.id;

  RETURN QUERY SELECT v_reservation.id, v_reservation.family_id, 'prepared'::text,
    v_attempt.photo_keys, p_upload_attempt_id;
END
$$;

CREATE OR REPLACE FUNCTION public.app_mark_persona_creation_uploaded(
  p_reservation_id uuid,
  p_upload_attempt_id uuid,
  p_photo_manifest jsonb
)
RETURNS TABLE (id uuid, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reservation public.persona_creation_reservations%ROWTYPE;
  v_attempt public.persona_creation_upload_attempts%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_upload_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Reservation and upload attempt IDs are required';
  END IF;
  SELECT * INTO v_reservation
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation reservation not found';
  END IF;
  SELECT * INTO v_attempt
  FROM public.persona_creation_upload_attempts attempt
  WHERE attempt.id = p_upload_attempt_id
    AND attempt.reservation_id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND OR v_reservation.upload_attempt_id IS DISTINCT FROM p_upload_attempt_id THEN
    RAISE EXCEPTION 'Persona creation upload attempt is not the owner';
  END IF;
  IF NOT public.app_persona_creation_attempt_keys_are_scoped(
      v_attempt.family_id, v_attempt.reservation_id, v_attempt.id, v_attempt.photo_keys
    )
    OR jsonb_typeof(p_photo_manifest) <> 'array'
    OR jsonb_array_length(p_photo_manifest) <> jsonb_array_length(v_attempt.photo_keys)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_photo_manifest) manifest
      WHERE jsonb_typeof(manifest) <> 'object'
        OR NOT (manifest ? 'key' AND manifest ? 'sha256' AND manifest ? 'size')
        OR EXISTS (
          SELECT 1 FROM jsonb_object_keys(manifest) AS manifest_keys(key)
          WHERE key NOT IN ('key', 'sha256', 'size')
        )
        OR jsonb_typeof(manifest->'key') <> 'string'
        OR jsonb_typeof(manifest->'sha256') <> 'string'
        OR jsonb_typeof(manifest->'size') <> 'number'
        OR manifest->>'sha256' !~ '^[0-9a-f]{64}$'
        OR (manifest->>'size') !~ '^[1-9][0-9]*$'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_attempt.photo_keys) expected_key
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_photo_manifest) manifest
        WHERE manifest->>'key' = expected_key
      )
    )
    OR EXISTS (
      SELECT manifest->>'key'
      FROM jsonb_array_elements(p_photo_manifest) manifest
      GROUP BY manifest->>'key'
      HAVING count(*) <> 1
    )
  THEN
    RAISE EXCEPTION 'Invalid Persona creation photo manifest';
  END IF;
  IF v_reservation.state = 'uploaded'
    AND v_attempt.status = 'accepted'
    AND v_reservation.photo_manifest = p_photo_manifest
    AND v_reservation.photo_keys = v_attempt.photo_keys
  THEN
    RETURN QUERY SELECT v_reservation.id, v_reservation.state;
    RETURN;
  END IF;
  IF v_reservation.state <> 'prepared' OR v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'Persona creation reservation is not ready for upload';
  END IF;

  UPDATE public.persona_creation_upload_attempts attempt
  SET photo_manifest = p_photo_manifest, status = 'accepted', lease_expires_at = now() + interval '10 minutes'
  WHERE attempt.id = v_attempt.id;

  UPDATE public.persona_creation_reservations reservation
  SET photo_keys = v_attempt.photo_keys,
      photo_manifest = p_photo_manifest,
      state = 'uploaded',
      upload_lease_expires_at = now() + interval '10 minutes'
  WHERE reservation.id = v_reservation.id;
  RETURN QUERY SELECT v_reservation.id, 'uploaded'::text;
END
$$;

CREATE OR REPLACE FUNCTION public.app_claim_persona_creation_compensation(
  p_reservation_id uuid,
  p_upload_attempt_id uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (id uuid, family_id uuid, photo_keys jsonb, cleanup_lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reservation public.persona_creation_reservations%ROWTYPE;
  v_attempt public.persona_creation_upload_attempts%ROWTYPE;
  v_token uuid := gen_random_uuid();
BEGIN
  IF p_upload_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Upload attempt ID is required';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Cleanup lease must be between 1 and 300 seconds';
  END IF;

  SELECT * INTO v_reservation
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_reservation.upload_attempt_id IS DISTINCT FROM p_upload_attempt_id
    OR v_reservation.state NOT IN ('prepared', 'uploaded', 'aborted') THEN
    RETURN;
  END IF;
  SELECT * INTO v_attempt
  FROM public.persona_creation_upload_attempts attempt
  WHERE attempt.id = p_upload_attempt_id
    AND attempt.reservation_id = v_reservation.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_reservation.cleanup_lease_token IS NOT NULL
    AND v_reservation.cleanup_lease_expires_at > now() THEN
    RETURN;
  END IF;
  IF NOT public.app_persona_creation_attempt_keys_are_scoped(
    v_attempt.family_id, v_attempt.reservation_id, v_attempt.id, v_attempt.photo_keys
  ) THEN
    UPDATE public.persona_creation_reservations reservation
    SET cleanup_quarantined_at = COALESCE(reservation.cleanup_quarantined_at, now()),
        cleanup_quarantine_reason = COALESCE(reservation.cleanup_quarantine_reason, 'invalid_photo_key_scope')
    WHERE reservation.id = v_reservation.id;
    RETURN;
  END IF;

  -- The row lock serializes against finalize. A committed finalize has state
  -- finalized and is never eligible; a rolled-back finalize leaves uploaded
  -- and can be atomically converted to cleanup ownership here.
  UPDATE public.persona_creation_reservations reservation
  SET state = 'aborted',
      cleanup_lease_token = v_token,
      cleanup_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      cleanup_attempts = reservation.cleanup_attempts + 1
  WHERE reservation.id = v_reservation.id;

  RETURN QUERY SELECT v_reservation.id, v_reservation.family_id, v_attempt.photo_keys, v_token;
END
$$;

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
  IF NOT public.app_persona_creation_keys_are_scoped(v_reservation.family_id, v_reservation.id, v_reservation.photo_keys) THEN
    RAISE EXCEPTION 'Persona creation photo keys are not creation-scoped';
  END IF;

  SELECT * INTO v_member
  FROM public.members member
  WHERE member.id = v_reservation.member_id
    AND member.family_id = v_reservation.family_id
  FOR SHARE;
  IF NOT FOUND OR v_member.role <> 'guardian' THEN
    RAISE EXCEPTION 'Guardian authority is required to finalize a Persona';
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

CREATE OR REPLACE FUNCTION public.app_abort_persona_creation(p_reservation_id uuid)
RETURNS TABLE (id uuid, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reservation public.persona_creation_reservations%ROWTYPE;
  v_is_service boolean := current_setting('role', true) = 'service_role';
BEGIN
  SELECT * INTO v_reservation
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND OR (
    NOT v_is_service
    AND (
      v_reservation.family_id IS DISTINCT FROM public.app_current_family_id()
      OR v_reservation.member_id IS DISTINCT FROM public.app_current_member_id()
      OR NOT public.app_is_guardian()
    )
  ) THEN
    RAISE EXCEPTION 'Persona creation reservation not found for the owning Guardian';
  END IF;
  IF v_reservation.state IN ('prepared', 'uploaded') THEN
    UPDATE public.persona_creation_reservations reservation
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
END
$$;

CREATE OR REPLACE FUNCTION public.app_claim_persona_creation_upload_attempt_cleanup(
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (id uuid, family_id uuid, reservation_id uuid, photo_keys jsonb, cleanup_lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Upload cleanup claim limit must be between 1 and 100';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Upload cleanup lease must be between 1 and 300 seconds';
  END IF;

  WITH invalid AS (
    SELECT attempt.id
    FROM public.persona_creation_upload_attempts attempt
    JOIN public.persona_creation_reservations reservation ON reservation.id = attempt.reservation_id
    WHERE attempt.cleanup_quarantined_at IS NULL
      AND NOT public.app_persona_creation_attempt_keys_are_scoped(
        attempt.family_id, attempt.reservation_id, attempt.id, attempt.photo_keys
      )
    ORDER BY attempt.created_at, attempt.id
    FOR UPDATE OF attempt SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.persona_creation_upload_attempts attempt
  SET cleanup_quarantined_at = COALESCE(attempt.cleanup_quarantined_at, now()),
      cleanup_quarantine_reason = COALESCE(attempt.cleanup_quarantine_reason, 'invalid_photo_key_scope')
  FROM invalid
  WHERE attempt.id = invalid.id;

  RETURN QUERY
  WITH candidate AS (
    SELECT attempt.id
    FROM public.persona_creation_upload_attempts attempt
    JOIN public.persona_creation_reservations reservation ON reservation.id = attempt.reservation_id
    WHERE attempt.cleanup_quarantined_at IS NULL
      AND (attempt.cleanup_lease_token IS NULL OR attempt.cleanup_lease_expires_at <= now())
      AND (
        reservation.state IN ('aborted', 'expired')
        OR (reservation.state IN ('prepared', 'uploaded') AND reservation.expires_at <= now())
        OR (
          reservation.state IN ('uploaded', 'finalized')
          AND reservation.upload_attempt_id IS DISTINCT FROM attempt.id
          AND attempt.lease_expires_at <= now()
        )
      )
      AND public.app_persona_creation_attempt_keys_are_scoped(
        attempt.family_id, attempt.reservation_id, attempt.id, attempt.photo_keys
      )
    ORDER BY attempt.lease_expires_at, attempt.created_at, attempt.id
    FOR UPDATE OF attempt SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.persona_creation_upload_attempts attempt
  SET cleanup_lease_token = gen_random_uuid(),
      cleanup_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      cleanup_attempts = attempt.cleanup_attempts + 1
  FROM candidate
  WHERE attempt.id = candidate.id
  RETURNING attempt.id, attempt.family_id, attempt.reservation_id, attempt.photo_keys, attempt.cleanup_lease_token;
END
$$;

CREATE OR REPLACE FUNCTION public.app_complete_persona_creation_upload_attempt_cleanup(
  p_upload_attempt_id uuid,
  p_cleanup_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_upload_attempt_id IS NULL OR p_cleanup_lease_token IS NULL THEN
    RAISE EXCEPTION 'Upload attempt and cleanup lease token are required';
  END IF;
  DELETE FROM public.persona_creation_upload_attempts attempt
  WHERE attempt.id = p_upload_attempt_id
    AND attempt.cleanup_lease_token = p_cleanup_lease_token
    AND attempt.cleanup_lease_expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation upload cleanup lease not found';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.app_release_persona_creation_upload_attempt_cleanup(
  p_upload_attempt_id uuid,
  p_cleanup_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.persona_creation_upload_attempts attempt
  SET cleanup_lease_expires_at = now()
  WHERE attempt.id = p_upload_attempt_id
    AND attempt.cleanup_lease_token = p_cleanup_lease_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation upload cleanup lease not found';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.app_claim_expired_persona_creation_reservations(
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (id uuid, family_id uuid, photo_keys jsonb, cleanup_lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Cleanup claim limit must be between 1 and 100';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Cleanup lease must be between 1 and 300 seconds';
  END IF;

  WITH invalid AS (
    SELECT reservation.id
    FROM public.persona_creation_reservations reservation
    WHERE reservation.blob_cleanup_completed_at IS NULL
      AND reservation.cleanup_quarantined_at IS NULL
      AND (
        reservation.state IN ('aborted', 'expired')
        OR (reservation.state IN ('prepared', 'uploaded') AND reservation.expires_at <= now())
      )
      AND NOT public.app_persona_creation_keys_are_scoped(
        reservation.family_id, reservation.id, reservation.photo_keys
      )
    ORDER BY reservation.expires_at, reservation.created_at, reservation.id
    FOR UPDATE OF reservation SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.persona_creation_reservations reservation
  SET cleanup_quarantined_at = COALESCE(reservation.cleanup_quarantined_at, now()),
      cleanup_quarantine_reason = COALESCE(reservation.cleanup_quarantine_reason, 'invalid_photo_key_scope')
  FROM invalid
  WHERE reservation.id = invalid.id;

  RETURN QUERY
  WITH candidate AS (
    SELECT reservation.id
    FROM public.persona_creation_reservations reservation
    WHERE reservation.blob_cleanup_completed_at IS NULL
      AND reservation.cleanup_quarantined_at IS NULL
      AND (
        reservation.state IN ('aborted', 'expired')
        OR (reservation.state IN ('prepared', 'uploaded') AND reservation.expires_at <= now())
      )
      AND (
        reservation.cleanup_lease_token IS NULL
        OR reservation.cleanup_lease_expires_at <= now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.persona_creation_upload_attempts attempt
        WHERE attempt.reservation_id = reservation.id
      )
      AND public.app_persona_creation_keys_are_scoped(reservation.family_id, reservation.id, reservation.photo_keys)
    ORDER BY reservation.expires_at, reservation.created_at, reservation.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.persona_creation_reservations reservation
  SET state = CASE WHEN reservation.state = 'aborted' THEN 'aborted' ELSE 'expired' END,
      cleanup_lease_token = gen_random_uuid(),
      cleanup_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      cleanup_attempts = reservation.cleanup_attempts + 1
  FROM candidate
  WHERE reservation.id = candidate.id
  RETURNING reservation.id, reservation.family_id, reservation.photo_keys, reservation.cleanup_lease_token;
END
$$;

CREATE OR REPLACE FUNCTION public.app_complete_persona_creation_expired_cleanup(
  p_reservation_id uuid,
  p_cleanup_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_receipt_id uuid;
  v_owns_receipt boolean;
  v_persona_id uuid;
  v_baby_id uuid;
  v_remediation_reason text;
BEGIN
  IF p_cleanup_lease_token IS NULL THEN
    RAISE EXCEPTION 'Cleanup lease token is required';
  END IF;
  SELECT reservation.adult_consent_receipt_id, reservation.owns_adult_consent_receipt,
         reservation.persona_id, reservation.baby_id, reservation.remediation_reason
  INTO v_receipt_id, v_owns_receipt, v_persona_id, v_baby_id, v_remediation_reason
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id
    AND reservation.state IN ('aborted', 'expired')
    AND reservation.cleanup_lease_token = p_cleanup_lease_token
    AND reservation.cleanup_lease_expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation cleanup lease not found';
  END IF;

  DELETE FROM public.persona_creation_reservations reservation
  WHERE reservation.id = p_reservation_id;

  IF v_remediation_reason IN (
    'legacy_non_guardian_adult_finalization',
    'legacy_baby_consent_unresolved',
    'baby_consent_invalid_before_dispatch'
  ) THEN
    DELETE FROM public.babies baby
    WHERE baby.id = v_baby_id;
    DELETE FROM public.personas persona
    WHERE persona.id = v_persona_id
      AND persona.status = 'failed';
  END IF;

  IF v_owns_receipt AND v_receipt_id IS NOT NULL THEN
    DELETE FROM public.consent_receipts receipt
    WHERE receipt.id = v_receipt_id
      AND receipt.subject_persona_id IS NULL;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.app_release_persona_creation_cleanup(
  p_reservation_id uuid,
  p_cleanup_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_cleanup_lease_token IS NULL THEN
    RAISE EXCEPTION 'Cleanup lease token is required';
  END IF;
  UPDATE public.persona_creation_reservations reservation
  SET cleanup_lease_expires_at = now()
  WHERE reservation.id = p_reservation_id
    AND reservation.state IN ('aborted', 'expired')
    AND reservation.cleanup_lease_token = p_cleanup_lease_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona creation cleanup lease not found';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.app_read_finalized_persona_creation_by_event(p_outbox_event_id uuid)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  persona_id uuid,
  state text,
  outbox_event_id uuid,
  photo_keys jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT reservation.id, reservation.family_id, reservation.persona_id,
         reservation.state, outbox.id, reservation.photo_keys
  FROM public.persona_creation_outbox outbox
  JOIN public.persona_creation_reservations reservation
    ON reservation.id = outbox.reservation_id
   AND reservation.family_id = outbox.family_id
  JOIN public.personas persona
    ON persona.id = reservation.persona_id
   AND persona.family_id = reservation.family_id
  WHERE outbox.id = p_outbox_event_id
    AND outbox.event_type = 'persona-creation-finalized'
    AND reservation.state = 'finalized'
    AND (
      reservation.kind <> 'baby'
      OR public.app_persona_creation_baby_reservation_consent_is_valid(reservation.id)
    )
    AND outbox.payload->>'eventId' = outbox.id::text
    AND outbox.payload->>'familyId' = outbox.family_id::text
    AND outbox.payload->>'reservationId' = outbox.reservation_id::text
    AND outbox.payload->>'personaId' = reservation.persona_id::text
$$;

CREATE OR REPLACE FUNCTION public.app_quarantine_invalid_persona_creation_outbox(p_limit integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
  v_reservation_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Outbox quarantine limit must be between 1 and 100';
  END IF;
  WITH invalid AS (
    SELECT outbox.id
    FROM public.persona_creation_outbox outbox
    WHERE outbox.status IN ('queued', 'leased')
      AND (
        (outbox.status = 'leased' AND (outbox.lease_expires_at IS NULL OR outbox.lease_token IS NULL))
        OR NOT EXISTS (
          SELECT 1
          FROM public.persona_creation_reservations reservation
          JOIN public.personas persona
            ON persona.id = reservation.persona_id
           AND persona.family_id = reservation.family_id
          WHERE reservation.id = outbox.reservation_id
            AND reservation.state = 'finalized'
            AND reservation.family_id = outbox.family_id
            AND outbox.event_type = 'persona-creation-finalized'
            AND outbox.payload->>'eventId' = outbox.id::text
            AND outbox.payload->>'familyId' = outbox.family_id::text
            AND outbox.payload->>'reservationId' = outbox.reservation_id::text
            AND outbox.payload->>'personaId' = reservation.persona_id::text
            AND (
              reservation.kind <> 'baby'
              OR public.app_persona_creation_baby_reservation_consent_is_valid(reservation.id)
            )
        )
      )
    ORDER BY outbox.created_at, outbox.id
    FOR UPDATE OF outbox SKIP LOCKED
    LIMIT p_limit
  ), failed AS (
    UPDATE public.persona_creation_outbox outbox
    SET status = 'failed', lease_expires_at = NULL, lease_token = NULL
    FROM invalid
    WHERE outbox.id = invalid.id
    RETURNING outbox.reservation_id
  )
  SELECT COALESCE(array_agg(failed.reservation_id), ARRAY[]::uuid[])
  INTO v_reservation_ids
  FROM failed;

  UPDATE public.personas persona
  SET status = 'failed'
  FROM public.persona_creation_reservations reservation
  WHERE reservation.id = ANY(v_reservation_ids)
    AND reservation.persona_id = persona.id
    AND reservation.kind = 'baby'
    AND reservation.state = 'finalized'
    AND NOT public.app_persona_creation_baby_reservation_consent_is_valid(reservation.id);

  UPDATE public.persona_creation_reservations reservation
  SET state = 'aborted',
      remediation_reason = 'baby_consent_invalid_before_dispatch'
  WHERE reservation.id = ANY(v_reservation_ids)
    AND reservation.kind = 'baby'
    AND reservation.state = 'finalized'
    AND NOT public.app_persona_creation_baby_reservation_consent_is_valid(reservation.id);

  v_count := cardinality(v_reservation_ids);
  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.app_claim_persona_creation_outbox(p_lease_seconds integer DEFAULT 60)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  reservation_id uuid,
  persona_id uuid,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Outbox lease must be between 1 and 300 seconds';
  END IF;
  PERFORM public.app_quarantine_invalid_persona_creation_outbox(25);

  RETURN QUERY
  WITH candidate AS (
    SELECT outbox.id, reservation.persona_id
    FROM public.persona_creation_outbox outbox
    JOIN public.persona_creation_reservations reservation
      ON reservation.id = outbox.reservation_id
     AND reservation.state = 'finalized'
     AND reservation.family_id = outbox.family_id
    JOIN public.personas persona
      ON persona.id = reservation.persona_id
     AND persona.family_id = reservation.family_id
    WHERE (
        outbox.status = 'queued'
        OR (outbox.status = 'leased' AND outbox.lease_expires_at <= now())
      )
      AND outbox.event_type = 'persona-creation-finalized'
      AND outbox.payload->>'eventId' = outbox.id::text
      AND outbox.payload->>'familyId' = outbox.family_id::text
      AND outbox.payload->>'reservationId' = outbox.reservation_id::text
      AND outbox.payload->>'personaId' = reservation.persona_id::text
      AND (
        reservation.kind <> 'baby'
        OR public.app_persona_creation_baby_reservation_consent_is_valid(reservation.id)
      )
    ORDER BY outbox.created_at, outbox.id
    FOR UPDATE OF outbox SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.persona_creation_outbox outbox
  SET status = 'leased',
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      lease_token = gen_random_uuid(),
      attempts = outbox.attempts + 1
  FROM candidate
  WHERE outbox.id = candidate.id
  RETURNING outbox.id, outbox.family_id, outbox.reservation_id,
    candidate.persona_id, outbox.lease_token;
END
$$;

CREATE OR REPLACE FUNCTION public.app_claim_persona_creation_outbox_for_reservation(
  p_reservation_id uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  reservation_id uuid,
  persona_id uuid,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'Reservation ID is required';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'Outbox lease must be between 1 and 300 seconds';
  END IF;
  PERFORM public.app_quarantine_invalid_persona_creation_outbox(25);

  RETURN QUERY
  WITH candidate AS (
    SELECT outbox.id, reservation.persona_id
    FROM public.persona_creation_outbox outbox
    JOIN public.persona_creation_reservations reservation
      ON reservation.id = outbox.reservation_id
     AND reservation.state = 'finalized'
     AND reservation.family_id = outbox.family_id
    JOIN public.personas persona
      ON persona.id = reservation.persona_id
     AND persona.family_id = reservation.family_id
    WHERE outbox.reservation_id = p_reservation_id
      AND (
        outbox.status = 'queued'
        OR (outbox.status = 'leased' AND outbox.lease_expires_at <= now())
      )
      AND outbox.event_type = 'persona-creation-finalized'
      AND outbox.payload->>'eventId' = outbox.id::text
      AND outbox.payload->>'familyId' = outbox.family_id::text
      AND outbox.payload->>'reservationId' = outbox.reservation_id::text
      AND outbox.payload->>'personaId' = reservation.persona_id::text
      AND (
        reservation.kind <> 'baby'
        OR public.app_persona_creation_baby_reservation_consent_is_valid(reservation.id)
      )
    FOR UPDATE OF outbox SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.persona_creation_outbox outbox
  SET status = 'leased',
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      lease_token = gen_random_uuid(),
      attempts = outbox.attempts + 1
  FROM candidate
  WHERE outbox.id = candidate.id
  RETURNING outbox.id, outbox.family_id, outbox.reservation_id,
    candidate.persona_id, outbox.lease_token;
END
$$;

CREATE OR REPLACE FUNCTION public.app_mark_persona_creation_outbox_sent(
  p_outbox_id uuid,
  p_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_lease_token IS NULL THEN
    RAISE EXCEPTION 'Outbox lease token is required';
  END IF;
  UPDATE public.persona_creation_outbox outbox
  SET status = 'sent', lease_expires_at = NULL, lease_token = NULL,
      sent_at = COALESCE(outbox.sent_at, now())
  WHERE outbox.id = p_outbox_id
    AND outbox.status = 'leased'
    AND outbox.lease_token = p_lease_token
    AND outbox.lease_expires_at > now();
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.persona_creation_outbox outbox
    WHERE outbox.id = p_outbox_id AND outbox.status = 'sent'
  ) THEN
    RAISE EXCEPTION 'Persona creation outbox lease not found';
  END IF;
END
$$;

-- Direct protocol table writes stay closed. Authenticated clients get only the
-- two user-intent RPCs; every state attestation and worker operation is service-only.
REVOKE ALL ON FUNCTION public.app_prepare_persona_creation(text, text, integer, text, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_prepare_adult_persona_creation(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_abort_persona_creation(uuid) FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_prepare_persona_creation(text, text, integer, text, jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_prepare_adult_persona_creation(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_abort_persona_creation(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.app_claim_persona_creation_upload(uuid, uuid, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_mark_persona_creation_uploaded(uuid, uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_claim_persona_creation_compensation(uuid, uuid, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_finalize_persona_creation(uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.persona_creation_upload_attempts FROM PUBLIC, authenticated;
GRANT SELECT ON TABLE public.persona_creation_upload_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.persona_creation_upload_attempts TO service_role;

REVOKE ALL ON FUNCTION public.app_claim_persona_creation_upload_attempt_cleanup(integer, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_complete_persona_creation_upload_attempt_cleanup(uuid, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_release_persona_creation_upload_attempt_cleanup(uuid, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_claim_expired_persona_creation_reservations(integer, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_complete_persona_creation_expired_cleanup(uuid, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_release_persona_creation_cleanup(uuid, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_read_finalized_persona_creation_by_event(uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_quarantine_invalid_persona_creation_outbox(integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_claim_persona_creation_outbox(integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_claim_persona_creation_outbox_for_reservation(uuid, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.app_mark_persona_creation_outbox_sent(uuid, uuid) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.app_claim_persona_creation_upload(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_mark_persona_creation_uploaded(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_claim_persona_creation_compensation(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_finalize_persona_creation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_claim_persona_creation_upload_attempt_cleanup(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_complete_persona_creation_upload_attempt_cleanup(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_release_persona_creation_upload_attempt_cleanup(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_claim_expired_persona_creation_reservations(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_complete_persona_creation_expired_cleanup(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_release_persona_creation_cleanup(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_read_finalized_persona_creation_by_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_quarantine_invalid_persona_creation_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_claim_persona_creation_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_claim_persona_creation_outbox_for_reservation(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_mark_persona_creation_outbox_sent(uuid, uuid) TO service_role;
