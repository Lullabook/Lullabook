-- Issue 34–44: Household multi-baby, family roster bonds, voice clips, video pages

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
