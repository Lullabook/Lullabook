-- PRD v22 local 194: persist RevenueCat subscription state and lifecycle receipts.
-- The existing moderation_audit table is Family-owned and already hydrated by
-- the request context; use it as the durable webhook inbox for this lifecycle.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IS NULL OR tier IN ('basic', 'normal', 'plus')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS moderation_audit_revenuecat_event_uidx
  ON moderation_audit (resource_type, resource_id)
  WHERE resource_type = 'revenuecat_lifecycle';

-- A Family hard-delete removes its consent receipt and must cascade through
-- an abandoned Persona-creation reservation before the sync layer deletes the
-- Family. Finalized reservations are already represented by their Persona.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'persona_creation_reservations_adult_consent_receipt_id_fkey'
  ) THEN
    ALTER TABLE persona_creation_reservations
      DROP CONSTRAINT persona_creation_reservations_adult_consent_receipt_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'persona_creation_reservations_adult_consent_receipt_id_fkey'
  ) THEN
    ALTER TABLE persona_creation_reservations
      ADD CONSTRAINT persona_creation_reservations_adult_consent_receipt_id_fkey
      FOREIGN KEY (adult_consent_receipt_id)
      REFERENCES consent_receipts(id) ON DELETE CASCADE;
  END IF;
END $$;
