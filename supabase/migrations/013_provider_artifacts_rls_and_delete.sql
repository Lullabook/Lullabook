-- Ticket 184: Family isolation and deletion coverage for provider/context artifacts.
-- This migration is safe to re-run against production-like projects. Provider
-- output URLs are transient; only copied Family-owned keys are persisted here.

CREATE TABLE IF NOT EXISTS story_allowance_reservations (
  storybook_id uuid PRIMARY KEY REFERENCES storybooks (id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('reserved', 'committed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_reason text
);

CREATE TABLE IF NOT EXISTS fal_training_requests (
  request_id text PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES personas (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  model text NOT NULL,
  steps integer NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  input_zip_key text,
  lora_weight_key text,
  configuration_key text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fal_webhook_receipts (
  fingerprint text PRIMARY KEY,
  request_id text NOT NULL REFERENCES fal_training_requests (request_id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  provider text NOT NULL,
  endpoint text NOT NULL,
  model text NOT NULL,
  pricing_version text NOT NULL,
  units jsonb NOT NULL,
  estimated_cost_usd numeric NOT NULL,
  actual_cost_usd numeric,
  latency_ms integer NOT NULL,
  request_id text NOT NULL,
  provider_request_id text NOT NULL,
  owning_entity_ids jsonb NOT NULL,
  attempt_type text NOT NULL,
  outcome text NOT NULL,
  cost_category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_context_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  storybook_id uuid NOT NULL REFERENCES storybooks (id) ON DELETE CASCADE,
  baby_id uuid REFERENCES babies (id) ON DELETE SET NULL,
  persona_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  moment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_count integer NOT NULL DEFAULT 0,
  past_story_summary_included boolean NOT NULL DEFAULT false,
  photo_description_count integer NOT NULL DEFAULT 0,
  token_estimate integer NOT NULL DEFAULT 0
);

-- Existing Family-owned tables are listed explicitly so a partially migrated
-- project gets the same RLS boundary as a fresh project.
ALTER TABLE IF EXISTS families ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS babies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS baby_person_bonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS consent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS storybooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS page_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS persisted_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS story_allowance_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fal_training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fal_webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS provider_cost_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS story_context_provenance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.families') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'families' AND policyname = 'ticket184 family isolation') THEN
    CREATE POLICY "ticket184 family isolation" ON families FOR ALL USING (id = app_current_family_id()) WITH CHECK (id = app_current_family_id());
  END IF;
  IF to_regclass('public.members') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'members' AND policyname = 'ticket184 member isolation') THEN
    CREATE POLICY "ticket184 member isolation" ON members FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.personas') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'personas' AND policyname = 'ticket184 persona isolation') THEN
    CREATE POLICY "ticket184 persona isolation" ON personas FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.babies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'babies' AND policyname = 'ticket184 baby isolation') THEN
    CREATE POLICY "ticket184 baby isolation" ON babies FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.baby_person_bonds') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'baby_person_bonds' AND policyname = 'ticket184 bond isolation') THEN
    CREATE POLICY "ticket184 bond isolation" ON baby_person_bonds FOR ALL USING (EXISTS (SELECT 1 FROM babies b WHERE b.id = baby_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM babies b JOIN personas p ON p.id = persona_id WHERE b.id = baby_id AND b.family_id = p.family_id AND b.family_id = app_current_family_id()));
  END IF;
  IF to_regclass('public.consent_receipts') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consent_receipts' AND policyname = 'ticket184 consent isolation') THEN
    CREATE POLICY "ticket184 consent isolation" ON consent_receipts FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.storybooks') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'storybooks' AND policyname = 'ticket184 storybook isolation') THEN
    CREATE POLICY "ticket184 storybook isolation" ON storybooks FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.pages') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'ticket184 page isolation') THEN
    CREATE POLICY "ticket184 page isolation" ON pages FOR ALL USING (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id()));
  END IF;
  IF to_regclass('public.page_candidates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'page_candidates' AND policyname = 'ticket184 candidate isolation') THEN
    CREATE POLICY "ticket184 candidate isolation" ON page_candidates FOR ALL USING (EXISTS (SELECT 1 FROM pages p JOIN storybooks b ON b.id = p.storybook_id WHERE p.id = page_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM pages p JOIN storybooks b ON b.id = p.storybook_id WHERE p.id = page_id AND b.family_id = app_current_family_id()));
  END IF;
  IF to_regclass('public.persisted_generations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'persisted_generations' AND policyname = 'ticket184 generation isolation') THEN
    CREATE POLICY "ticket184 generation isolation" ON persisted_generations FOR ALL USING (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id()));
  END IF;
  IF to_regclass('public.story_allowance_reservations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'story_allowance_reservations' AND policyname = 'ticket184 allowance isolation') THEN
    CREATE POLICY "ticket184 allowance isolation" ON story_allowance_reservations FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.fal_training_requests') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fal_training_requests' AND policyname = 'ticket184 training isolation') THEN
    CREATE POLICY "ticket184 training isolation" ON fal_training_requests FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.fal_webhook_receipts') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fal_webhook_receipts' AND policyname = 'ticket184 webhook isolation') THEN
    CREATE POLICY "ticket184 webhook isolation" ON fal_webhook_receipts FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.provider_cost_ledger') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_cost_ledger' AND policyname = 'ticket184 cost isolation') THEN
    CREATE POLICY "ticket184 cost isolation" ON provider_cost_ledger FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
  IF to_regclass('public.story_context_provenance') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'story_context_provenance' AND policyname = 'ticket184 provenance isolation') THEN
    CREATE POLICY "ticket184 provenance isolation" ON story_context_provenance FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
  END IF;
END $$;
