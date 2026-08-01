-- LUL-109: make moderation evidence durably Family-owned so RLS-safe
-- inventory and ON DELETE CASCADE cover Page-generation audit rows.

ALTER TABLE moderation_audit
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families (id) ON DELETE CASCADE;

-- Best-effort ownership for legacy rows whose resource identifiers used the
-- historical member/persona/character/Storybook conventions.
UPDATE moderation_audit audit
SET family_id = member.family_id
FROM members member
WHERE audit.family_id IS NULL
  AND (
    audit.resource_id = member.id::text
    OR audit.resource_id LIKE '%' || member.id::text || '%'
  );

UPDATE moderation_audit audit
SET family_id = persona.family_id
FROM personas persona
WHERE audit.family_id IS NULL
  AND audit.resource_id = persona.id::text;

UPDATE moderation_audit audit
SET family_id = character.family_id
FROM characters character
WHERE audit.family_id IS NULL
  AND audit.resource_id = character.id::text;

UPDATE moderation_audit audit
SET family_id = storybook.family_id
FROM storybooks storybook
WHERE audit.family_id IS NULL
  AND (
    audit.resource_id = storybook.id::text
    OR audit.resource_id LIKE storybook.id::text || '/%'
  );

UPDATE moderation_audit audit
SET family_id = storybook.family_id
FROM page_candidates candidate
JOIN pages page ON page.id = candidate.page_id
JOIN storybooks storybook ON storybook.id = page.storybook_id
WHERE audit.family_id IS NULL
  AND audit.resource_id = 'candidate-' || candidate.id::text;

-- Existing unowned legacy rows remain service-only. New and updated rows must
-- carry an owner; NOT VALID avoids destroying historical safety evidence that
-- cannot be attributed after the fact.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moderation_audit_family_owned'
      AND conrelid = 'moderation_audit'::regclass
  ) THEN
    ALTER TABLE moderation_audit
      ADD CONSTRAINT moderation_audit_family_owned
      CHECK (family_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
