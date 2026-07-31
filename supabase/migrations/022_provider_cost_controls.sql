-- LUL-108: durable, Family-scoped provider spend controls.
-- A scope of `all` is global to every payable route in the owning Family.
-- Service-role workflow workers enforce these rows immediately before provider calls.

CREATE TABLE IF NOT EXISTS provider_kill_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families (id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('all', 'provider', 'model', 'endpoint', 'provider-model')),
  provider text,
  model text,
  endpoint text,
  threshold text NOT NULL CHECK (threshold = 'red'),
  reason text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'all') OR
    (scope = 'provider' AND provider IS NOT NULL) OR
    (scope = 'model' AND model IS NOT NULL) OR
    (scope = 'endpoint' AND endpoint IS NOT NULL) OR
    (scope = 'provider-model' AND provider IS NOT NULL AND model IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_kill_switches_active_route_idx
  ON provider_kill_switches (family_id, active, provider, model, endpoint);

ALTER TABLE provider_kill_switches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_kill_switches'
      AND policyname = 'lul108 cost-control isolation'
  ) THEN
    CREATE POLICY "lul108 cost-control isolation" ON provider_kill_switches
      FOR ALL
      USING (family_id = app_current_family_id() OR family_id IS NULL)
      WITH CHECK (family_id = app_current_family_id());
  END IF;
END $$;
