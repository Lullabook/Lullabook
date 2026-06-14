-- Issue 50: Moment capture + Journal timeline

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

-- Down (reversible):
-- DROP INDEX IF EXISTS moments_baby_id_occurred_on_idx;
-- DROP TABLE IF EXISTS moments;
