-- Ticket 178 incremental migration. Apply after schema-incremental-008-011.sql.
-- Idempotent; covers consent lifecycle/method fields and Family RLS.

ALTER TABLE consent_receipts
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE consent_receipts
  DROP CONSTRAINT IF EXISTS consent_receipts_method_check,
  DROP CONSTRAINT IF EXISTS consent_receipts_status_check;
ALTER TABLE consent_receipts
  ADD CONSTRAINT consent_receipts_method_check
    CHECK (method IS NULL OR method IN ('payment_vpc', 'email_plus', 'signed_form', 'otp')),
  ADD CONSTRAINT consent_receipts_status_check
    CHECK (status IN ('verified', 'revoked', 'expired'));

ALTER TABLE email_plus_vpc_requests
  DROP CONSTRAINT IF EXISTS email_plus_vpc_requests_status_check;
ALTER TABLE email_plus_vpc_requests
  ADD CONSTRAINT email_plus_vpc_requests_status_check
    CHECK (status IN ('requested', 'link_sent', 'confirmed', 'revoked', 'expired'));

ALTER TABLE babies ENABLE ROW LEVEL SECURITY;
ALTER TABLE baby_person_bonds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'babies' AND policyname = 'babies visible within family') THEN
    CREATE POLICY "babies visible within family" ON babies FOR SELECT
      USING (family_id = app_current_family_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'babies' AND policyname = 'guardian manages babies') THEN
    CREATE POLICY "guardian manages babies" ON babies FOR ALL
      USING (family_id = app_current_family_id() AND app_is_guardian())
      WITH CHECK (family_id = app_current_family_id() AND app_is_guardian());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'baby_person_bonds' AND policyname = 'bonds visible within family') THEN
    CREATE POLICY "bonds visible within family" ON baby_person_bonds FOR SELECT
      USING (EXISTS (SELECT 1 FROM babies b WHERE b.id = baby_id AND b.family_id = app_current_family_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'baby_person_bonds' AND policyname = 'guardian manages bonds') THEN
    CREATE POLICY "guardian manages bonds" ON baby_person_bonds FOR ALL
      USING (EXISTS (SELECT 1 FROM babies b WHERE b.id = baby_id AND b.family_id = app_current_family_id()) AND app_is_guardian())
      WITH CHECK (EXISTS (
        SELECT 1 FROM babies b JOIN personas p ON p.family_id = b.family_id
        WHERE b.id = baby_id AND p.id = persona_id AND b.family_id = app_current_family_id()
      ) AND app_is_guardian());
  END IF;
END $$;
