-- Lullabook incremental schema — run ONCE if you already applied schema.sql (001–003).
-- Supabase Dashboard → SQL Editor → New query → paste all → Run.
-- Adds: babies, bonds, voice clips, moments, journal tables (migrations 004–007).

-- ========== 004_maya_world.sql ==========
ALTER TABLE members ADD COLUMN IF NOT EXISTS selected_baby_id uuid;

CREATE TABLE IF NOT EXISTS babies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  roster_group_id uuid NOT NULL,
  roster_scope text NOT NULL DEFAULT 'shared' CHECK (roster_scope IN ('shared', 'isolated')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS babies_family_id_idx ON babies(family_id);

CREATE TABLE IF NOT EXISTS baby_person_bonds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT '',
  baby_calls_them text NOT NULL DEFAULT '',
  they_call_baby text NOT NULL DEFAULT '',
  UNIQUE (baby_id, persona_id)
);

CREATE TABLE IF NOT EXISTS voice_consent_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL,
  notice_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS voice_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  label text NOT NULL,
  transcript text NOT NULL,
  duration_secs integer NOT NULL,
  blob_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storybooks ADD COLUMN IF NOT EXISTS baby_id uuid REFERENCES babies(id);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS voice_clip_id uuid REFERENCES voice_clips(id);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS video_blob_key text;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS video_url text;

-- ========== 005_character_description.sql ==========
ALTER TABLE characters ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- ========== 006_moments.sql ==========
CREATE TABLE IF NOT EXISTS moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  baby_id uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body text NOT NULL,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  is_significant boolean NOT NULL DEFAULT false,
  moment_type text NOT NULL DEFAULT 'milestone',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moments_baby_id_occurred_on_idx
  ON moments(baby_id, occurred_on DESC, created_at DESC);

-- ========== 007_journal_moments_extras.sql ==========
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
