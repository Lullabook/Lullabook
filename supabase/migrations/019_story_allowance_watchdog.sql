-- LUL-102: durable, exactly-once recovery for stranded Story generation.

CREATE OR REPLACE FUNCTION public.app_story_allowance_terminal_state_is_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status IN ('committed', 'released') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS story_allowance_terminal_state_is_immutable
  ON public.story_allowance_reservations;
CREATE TRIGGER story_allowance_terminal_state_is_immutable
BEFORE UPDATE ON public.story_allowance_reservations
FOR EACH ROW
EXECUTE FUNCTION public.app_story_allowance_terminal_state_is_immutable();

CREATE OR REPLACE FUNCTION public.app_reap_stranded_storybook_generations(
  p_now timestamptz,
  p_budget_ms bigint,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  storybook_id uuid,
  allowance_released boolean,
  terminal_status text,
  allowance_status text,
  released_at timestamptz,
  release_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_book record;
  v_released boolean;
  v_row_count integer;
  v_allowance public.story_allowance_reservations%ROWTYPE;
BEGIN
  IF p_now IS NULL OR p_budget_ms < 0 OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid Story watchdog request';
  END IF;

  FOR v_book IN
    SELECT
      book.id,
      EXISTS (
        SELECT 1
        FROM public.persisted_generations generation
        WHERE generation.storybook_id = book.id
          AND jsonb_typeof(generation.story->'pages') = 'array'
          AND jsonb_array_length(generation.story->'pages') > 0
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(generation.story->'pages') page
            WHERE length(trim(COALESCE(page->>'text', ''))) > 0
          )
      ) AS has_story_text
    FROM public.storybooks book
    WHERE book.status = 'generating'
      AND book.created_at < p_now - make_interval(secs => p_budget_ms::double precision / 1000.0)
    ORDER BY book.created_at, book.id
    FOR UPDATE OF book SKIP LOCKED
    LIMIT p_limit
  LOOP
    IF v_book.has_story_text THEN
      UPDATE public.storybooks SET status = 'draft' WHERE id = v_book.id;
      v_released := false;
    ELSE
      UPDATE public.storybooks SET status = 'failed' WHERE id = v_book.id;
      UPDATE public.story_allowance_reservations
      SET status = 'released',
          released_at = p_now,
          release_reason = 'story_text_generation_failed'
      WHERE story_allowance_reservations.storybook_id = v_book.id
        AND status = 'reserved';
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_released := v_row_count = 1;
    END IF;

    SELECT * INTO v_allowance
    FROM public.story_allowance_reservations reservation
    WHERE reservation.storybook_id = v_book.id;

    storybook_id := v_book.id;
    allowance_released := v_released;
    terminal_status := CASE WHEN v_book.has_story_text THEN 'draft' ELSE 'failed' END;
    allowance_status := v_allowance.status;
    released_at := v_allowance.released_at;
    release_reason := v_allowance.release_reason;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.app_reap_stranded_storybook_generations(timestamptz, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_reap_stranded_storybook_generations(timestamptz, bigint, integer) TO service_role;
