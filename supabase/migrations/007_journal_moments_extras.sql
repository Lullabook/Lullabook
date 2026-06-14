-- Issues 51–56: linked people, auto-context watermarks, journal nudge state

CREATE TABLE IF NOT EXISTS moment_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES personas(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  CHECK (
    (persona_id IS NOT NULL AND character_id IS NULL)
    OR (persona_id IS NULL AND character_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS moment_people_moment_persona_idx
  ON moment_people(moment_id, persona_id) WHERE persona_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS moment_people_moment_character_idx
  ON moment_people(moment_id, character_id) WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS baby_auto_context_watermarks (
  baby_id uuid PRIMARY KEY REFERENCES babies(id) ON DELETE CASCADE,
  last_story_at timestamptz
);

CREATE TABLE IF NOT EXISTS journal_nudge_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  baby_id uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('daily_dismiss', 'weekly_seen')),
  suppressed_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, baby_id, kind, suppressed_on)
);

-- Down (reversible):
-- DROP TABLE IF EXISTS journal_nudge_state;
-- DROP TABLE IF EXISTS baby_auto_context_watermarks;
-- DROP TABLE IF EXISTS moment_people;
