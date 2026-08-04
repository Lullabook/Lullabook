-- Hard-delete must be able to remove an abandoned Adult Persona reservation
-- after its consent receipt is erased. The service-role sync path also removes
-- reservation/outbox/upload rows directly before the remaining family graph.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'persona_creation_reservations_adult_consent_receipt_id_fkey'
  ) THEN
    ALTER TABLE persona_creation_reservations
      DROP CONSTRAINT persona_creation_reservations_adult_consent_receipt_id_fkey;
  END IF;
  ALTER TABLE persona_creation_reservations
    ADD CONSTRAINT persona_creation_reservations_adult_consent_receipt_id_fkey
    FOREIGN KEY (adult_consent_receipt_id)
    REFERENCES consent_receipts(id) ON DELETE CASCADE;
END $$;
