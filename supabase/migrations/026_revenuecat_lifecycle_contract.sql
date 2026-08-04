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
