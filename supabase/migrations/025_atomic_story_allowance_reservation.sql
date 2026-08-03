-- LUL-190: reserve the shared Story allowance in the same PostgreSQL transaction
-- that creates the reservation. The Family row is the serialization point;
-- application-level count-then-insert checks are not sufficient across workers.

CREATE OR REPLACE FUNCTION public.app_reserve_story_allowance(
  p_storybook_id uuid,
  p_family_id uuid,
  p_actor_member_id uuid
)
RETURNS TABLE (
  reserved boolean,
  count integer,
  cap integer,
  error_code text,
  reset_date date,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cap constant integer := 4;
  v_count integer;
  v_existing public.story_allowance_reservations%ROWTYPE;
  v_book public.storybooks%ROWTYPE;
  v_member_family uuid;
  v_reset date := (date_trunc('month', now()) + interval '1 month')::date;
BEGIN
  IF p_storybook_id IS NULL OR p_family_id IS NULL OR p_actor_member_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Story allowance reservation request';
  END IF;

  SELECT m.family_id
    INTO v_member_family
    FROM public.members m
   WHERE m.id = p_actor_member_id;
  IF v_member_family IS NULL OR v_member_family <> p_family_id THEN
    RAISE EXCEPTION 'Story allowance actor is not a member of the Family';
  END IF;

  -- Serialize all allowance decisions for this Family. This lock is held until
  -- the insert below commits, so two concurrent cap-minus-one requests cannot
  -- both observe the same remaining slot.
  PERFORM 1 FROM public.families f WHERE f.id = p_family_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.story_allowance_reservations r
   WHERE r.storybook_id = p_storybook_id;
  IF FOUND THEN
    IF v_existing.family_id <> p_family_id THEN
      RAISE EXCEPTION 'Story allowance belongs to another Family';
    END IF;
    RETURN QUERY SELECT
      v_existing.status IN ('reserved', 'committed'),
      v_cap,
      v_cap,
      CASE WHEN v_existing.status = 'released' THEN 'story_reservation_terminal' ELSE NULL END,
      v_reset,
      v_existing.created_at;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.family_id = p_family_id
       AND s.status = 'active'
  ) THEN
    RETURN QUERY SELECT false, 0, 0, 'not_entitled'::text, v_reset, NULL::timestamptz;
    RETURN;
  END IF;

  -- Count active reservations and legacy Storybooks in one Family-scoped set.
  -- Failed Story text is refundable; a valid draft with failed Page art is not.
  SELECT count(*)::integer
    INTO v_count
    FROM (
      SELECT r.storybook_id
        FROM public.story_allowance_reservations r
        LEFT JOIN public.storybooks b ON b.id = r.storybook_id
       WHERE r.family_id = p_family_id
         AND r.status IN ('reserved', 'committed')
         AND r.created_at >= date_trunc('month', now())
         AND (b.id IS NULL OR b.status <> 'failed')
      UNION
      SELECT b.id
        FROM public.storybooks b
       WHERE b.family_id = p_family_id
         AND b.status IN ('generating', 'draft', 'finalized')
         AND b.created_at >= date_trunc('month', now())
         AND NOT EXISTS (
           SELECT 1
             FROM public.story_allowance_reservations r
            WHERE r.storybook_id = b.id
         )
    ) active_storybooks;

  IF v_count >= v_cap THEN
    RETURN QUERY SELECT false, v_count, v_cap, 'story_cap_reached'::text, v_reset, NULL::timestamptz;
    RETURN;
  END IF;

  -- The service's in-memory Storybook is synced after this RPC returns. Insert
  -- a minimal durable row first because the existing allowance table correctly
  -- retains a foreign key to Storybooks; the later upsert fills the full Brief.
  SELECT *
    INTO v_book
    FROM public.storybooks b
   WHERE b.id = p_storybook_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_book.family_id <> p_family_id OR v_book.created_by_member_id <> p_actor_member_id THEN
      RAISE EXCEPTION 'Storybook belongs to another Family or Member';
    END IF;
  ELSE
    INSERT INTO public.storybooks (
      id, family_id, created_by_member_id, status, brief, created_at
    ) VALUES (
      p_storybook_id, p_family_id, p_actor_member_id, 'generating', '{}'::jsonb, now()
    );
  END IF;

  INSERT INTO public.story_allowance_reservations (
    storybook_id, family_id, status, created_at
  ) VALUES (
    p_storybook_id, p_family_id, 'reserved', now()
  );

  RETURN QUERY SELECT true, v_count + 1, v_cap, NULL::text, v_reset, now();
END
$$;

REVOKE ALL ON FUNCTION public.app_reserve_story_allowance(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_reserve_story_allowance(uuid, uuid, uuid) TO service_role;

-- A reservation can fail after the atomic reserve (queue authorization or
-- dispatch failure). Release is a separate idempotent terminal transition so
-- that path cannot strand a Family's allowance slot.
CREATE OR REPLACE FUNCTION public.app_release_story_allowance(
  p_storybook_id uuid,
  p_family_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family_id uuid;
BEGIN
  IF p_storybook_id IS NULL OR p_family_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Story allowance release request';
  END IF;

  -- Use the same Family serialization point as reservation so a release and a
  -- concurrent replay cannot observe contradictory terminal states.
  PERFORM 1 FROM public.families f WHERE f.id = p_family_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  SELECT r.family_id
    INTO v_family_id
    FROM public.story_allowance_reservations r
   WHERE r.storybook_id = p_storybook_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_family_id <> p_family_id THEN
    RAISE EXCEPTION 'Story allowance belongs to another Family';
  END IF;

  UPDATE public.story_allowance_reservations
     SET status = 'released',
         released_at = now(),
         release_reason = 'story_text_generation_failed'
   WHERE storybook_id = p_storybook_id
     AND status = 'reserved';
  RETURN FOUND;
END
$$;

REVOKE ALL ON FUNCTION public.app_release_story_allowance(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_release_story_allowance(uuid, uuid) TO service_role;

-- Request IDs are stable attempt keys in the production ledger. A replay must
-- update/reconcile the existing row, never append a second cost row.
CREATE UNIQUE INDEX IF NOT EXISTS provider_cost_ledger_family_request_key
  ON public.provider_cost_ledger (family_id, request_id);

-- NOT VALID keeps deployment compatible with any historical rows that need
-- reconciliation, while enforcing truthful costs on every new/replayed write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_cost_ledger_estimated_positive'
  ) THEN
    ALTER TABLE public.provider_cost_ledger
      ADD CONSTRAINT provider_cost_ledger_estimated_positive
      CHECK (estimated_cost_usd > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_cost_ledger_actual_positive'
  ) THEN
    ALTER TABLE public.provider_cost_ledger
      ADD CONSTRAINT provider_cost_ledger_actual_positive
      CHECK (actual_cost_usd IS NULL OR actual_cost_usd > 0) NOT VALID;
  END IF;
END $$;
