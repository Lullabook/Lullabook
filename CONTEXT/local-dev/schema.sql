-- Lullabook combined schema — paste into Supabase SQL Editor and Run.
-- Generated from supabase/migrations/001..003 (in order). Idempotent-ish: run once on a fresh project.

-- ============================================================
-- supabase/migrations/001_families_rls.sql
-- ============================================================
-- Walking skeleton schema with row-level security (issue 01)
create table families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id),
  family_id uuid not null references families (id) on delete cascade,
  email text not null,
  role text not null check (role in ('guardian', 'member')),
  self_persona_id uuid,
  jurisdiction text not null default 'US',
  created_at timestamptz not null default now()
);

create table personas (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by_member_id uuid not null references members (id),
  kind text not null check (kind in ('baby', 'adult')),
  display_name text not null,
  status text not null check (status in ('training', 'ready', 'failed')),
  lora_weight_key text,
  created_at timestamptz not null default now()
);

alter table families enable row level security;
alter table members enable row level security;
alter table personas enable row level security;

create policy "members read own family personas"
  on personas for select
  using (
    family_id in (
      select family_id from members where auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- supabase/migrations/002_full_domain.sql
-- ============================================================
-- Full domain schema with row-level security (PRD v2 productionization).
-- Extends the walking-skeleton tables (001) and adds every remaining entity in
-- src/domain/types.ts. Per-Family RLS is the isolation boundary (ADR-0011);
-- Guardian-only actions are enforced here, not just in the UI.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The Family of the calling auth user. SECURITY DEFINER so policies can read
-- members without recursing into the members policy itself.
create or replace function app_current_family_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select family_id from members where auth_user_id = auth.uid() limit 1;
$$;

-- The Member row of the calling auth user.
create or replace function app_current_member_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from members where auth_user_id = auth.uid() limit 1;
$$;

-- True when the calling auth user is a Guardian of their Family.
create or replace function app_is_guardian()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role = 'guardian' from members where auth_user_id = auth.uid() limit 1),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Walking-skeleton table extensions
-- ---------------------------------------------------------------------------

alter table personas
  add column if not exists promoted_from_character_id uuid,
  add column if not exists questionnaire jsonb;

-- Family rows are only visible to their own Members.
create policy "family visible to its members"
  on families for select
  using (id = app_current_family_id());

create policy "members visible within family"
  on members for select
  using (family_id = app_current_family_id());

-- Guardians may remove non-guardian Members of their own Family.
create policy "guardian removes members"
  on members for delete
  using (
    family_id = app_current_family_id()
    and app_is_guardian()
    and role <> 'guardian'
  );

create policy "member updates own row"
  on members for update
  using (id = app_current_member_id())
  with check (family_id = app_current_family_id());

-- Persona writes go through the server (service role) after the consent gate;
-- these policies are defense-in-depth for any direct client access.
create policy "member updates own family personas"
  on personas for update
  using (family_id = app_current_family_id())
  with check (family_id = app_current_family_id());

create policy "guardian inserts baby persona"
  on personas for insert
  with check (
    family_id = app_current_family_id()
    and (kind <> 'baby' or app_is_guardian())
  );

-- ---------------------------------------------------------------------------
-- Characters (free text tier, ADR-0016) + light consent receipts
-- ---------------------------------------------------------------------------

create table characters (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by_member_id uuid not null references members (id) on delete cascade,
  display_name text not null,
  questionnaire jsonb not null,
  promoted_persona_id uuid references personas (id),
  created_at timestamptz not null default now()
);

alter table characters enable row level security;

create policy "characters visible within family"
  on characters for select
  using (family_id = app_current_family_id());

create policy "member inserts own family characters"
  on characters for insert
  with check (
    family_id = app_current_family_id()
    and created_by_member_id = app_current_member_id()
  );

create policy "member updates own family characters"
  on characters for update
  using (family_id = app_current_family_id())
  with check (family_id = app_current_family_id());

create table light_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  jurisdiction text not null,
  notice_version text not null,
  attestation text not null,
  consented_at timestamptz not null default now()
);

alter table light_consent_receipts enable row level security;

create policy "light consent receipts visible within family"
  on light_consent_receipts for select
  using (family_id = app_current_family_id());

create policy "guardian records light consent"
  on light_consent_receipts for insert
  with check (family_id = app_current_family_id() and app_is_guardian());

-- ---------------------------------------------------------------------------
-- Consent receipts (verifiable parental consent, ADR-0008)
-- ---------------------------------------------------------------------------

create table consent_receipts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  jurisdiction text not null,
  notice_version text not null,
  consented_at timestamptz not null default now()
);

alter table consent_receipts enable row level security;

create policy "consent receipts visible within family"
  on consent_receipts for select
  using (family_id = app_current_family_id());

create policy "guardian records consent"
  on consent_receipts for insert
  with check (family_id = app_current_family_id() and app_is_guardian());

-- ---------------------------------------------------------------------------
-- Subscriptions (ADR-0009); written only by the Stripe webhook (service role)
-- ---------------------------------------------------------------------------

create table subscriptions (
  family_id uuid primary key references families (id) on delete cascade,
  status text not null check (status in ('none', 'active', 'canceled', 'past_due')),
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "subscription visible within family"
  on subscriptions for select
  using (family_id = app_current_family_id());

-- ---------------------------------------------------------------------------
-- Storybooks → Pages → Page candidates (ADR-0004, ADR-0013)
-- ---------------------------------------------------------------------------

create table storybooks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by_member_id uuid not null references members (id) on delete cascade,
  status text not null check (status in ('generating', 'draft', 'finalized', 'failed')),
  brief jsonb not null,
  style_bible jsonb,
  classic_id text,
  reroll_budget_remaining int not null default 5,
  reroll_credits int not null default 0,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

alter table storybooks enable row level security;

-- Drafts are private to the creating Member (ADR-0013); generating/failed books
-- are likewise only the creator's business. Finalized books are Family-visible.
create policy "storybook visibility"
  on storybooks for select
  using (
    family_id = app_current_family_id()
    and (status = 'finalized' or created_by_member_id = app_current_member_id())
  );

create policy "member inserts own storybooks"
  on storybooks for insert
  with check (
    family_id = app_current_family_id()
    and created_by_member_id = app_current_member_id()
  );

create policy "creator updates own storybooks"
  on storybooks for update
  using (
    family_id = app_current_family_id()
    and created_by_member_id = app_current_member_id()
  );

create table pages (
  id text primary key, -- deterministic: {storybookId}-page-{index}
  storybook_id uuid not null references storybooks (id) on delete cascade,
  index int not null,
  text text not null,
  illustration_url text,
  illustration_blob_key text,
  generation_status text not null
    check (generation_status in ('pending', 'ready', 'quarantined', 'failed')),
  persona_count int not null default 1,
  unique (storybook_id, index)
);

alter table pages enable row level security;

create policy "pages follow storybook visibility"
  on pages for select
  using (
    exists (
      select 1 from storybooks b
      where b.id = storybook_id
        and b.family_id = app_current_family_id()
        and (b.status = 'finalized' or b.created_by_member_id = app_current_member_id())
    )
  );

create table page_candidates (
  id text primary key, -- deterministic: {pageId}-reroll-{n} / {pageId}-recover-{n}
  page_id text not null references pages (id) on delete cascade,
  kind text not null check (kind in ('text', 'image')),
  content text not null,
  selected boolean not null default false,
  created_at timestamptz not null default now()
);

alter table page_candidates enable row level security;

create policy "page candidates follow storybook visibility"
  on page_candidates for select
  using (
    exists (
      select 1 from pages p
      join storybooks b on b.id = p.storybook_id
      where p.id = page_id
        and b.family_id = app_current_family_id()
        and (b.status = 'finalized' or b.created_by_member_id = app_current_member_id())
    )
  );

-- Persisted output of the structured Claude pass, read by the fan-out steps
-- (PRD v2: later steps read persisted state, never an in-process variable).
create table persisted_generations (
  storybook_id uuid primary key references storybooks (id) on delete cascade,
  story jsonb not null,
  persisted_at timestamptz not null default now()
);

alter table persisted_generations enable row level security;

create policy "persisted generations follow storybook visibility"
  on persisted_generations for select
  using (
    exists (
      select 1 from storybooks b
      where b.id = storybook_id
        and b.family_id = app_current_family_id()
        and b.created_by_member_id = app_current_member_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Text Stories (free tier, ADR-0016)
-- ---------------------------------------------------------------------------

create table text_stories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by_member_id uuid not null references members (id) on delete cascade,
  brief jsonb not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table text_stories enable row level security;

create policy "text stories visible within family"
  on text_stories for select
  using (family_id = app_current_family_id());

create policy "member inserts own text stories"
  on text_stories for insert
  with check (
    family_id = app_current_family_id()
    and created_by_member_id = app_current_member_id()
  );

-- ---------------------------------------------------------------------------
-- Share links (ADR-0013): revocable, non-indexed, optional expiry/passcode
-- ---------------------------------------------------------------------------

create table share_links (
  id uuid primary key default gen_random_uuid(),
  storybook_id uuid not null references storybooks (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  passcode_hash text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table share_links enable row level security;

-- Anonymous share access is resolved server-side (service role) so the token
-- never doubles as an RLS bypass; Members see their Family's links.
create policy "share links visible within family"
  on share_links for select
  using (
    exists (
      select 1 from storybooks b
      where b.id = storybook_id and b.family_id = app_current_family_id()
    )
  );

create policy "member manages own family share links"
  on share_links for all
  using (
    exists (
      select 1 from storybooks b
      where b.id = storybook_id and b.family_id = app_current_family_id()
    )
  )
  with check (
    exists (
      select 1 from storybooks b
      where b.id = storybook_id and b.family_id = app_current_family_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Moderation audit (ADR-0010): service-role only, never client-readable
-- ---------------------------------------------------------------------------

create table moderation_audit (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  resource_type text not null,
  resource_id text not null,
  outcome text not null check (outcome in ('allowed', 'blocked', 'quarantined')),
  reason text,
  created_at timestamptz not null default now()
);

alter table moderation_audit enable row level security;
-- No policies: RLS with no policy denies all client access by design.

create table banned_accounts (
  account_id text primary key,
  banned_at timestamptz not null default now()
);

alter table banned_accounts enable row level security;
-- Service-role only.

-- ---------------------------------------------------------------------------
-- Invites, pending Briefs (cold start), purge schedule (ADR-0007)
-- ---------------------------------------------------------------------------

create table invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  email text not null,
  invited_by uuid not null references members (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table invites enable row level security;

create policy "guardian manages invites"
  on invites for all
  using (family_id = app_current_family_id() and app_is_guardian())
  with check (family_id = app_current_family_id() and app_is_guardian());

create table pending_briefs (
  key text primary key, -- {memberId}:{personaId}
  member_id uuid not null references members (id) on delete cascade,
  persona_id uuid not null references personas (id) on delete cascade,
  brief jsonb not null,
  submitted_at timestamptz not null default now()
);

alter table pending_briefs enable row level security;

create policy "member manages own pending briefs"
  on pending_briefs for all
  using (member_id = app_current_member_id())
  with check (member_id = app_current_member_id());

create table purge_schedule (
  family_id uuid primary key references families (id) on delete cascade,
  purge_at timestamptz not null
);

alter table purge_schedule enable row level security;

create policy "purge schedule visible within family"
  on purge_schedule for select
  using (family_id = app_current_family_id());

-- ---------------------------------------------------------------------------
-- Jurisdiction configs (ADR-0015): public read, ops-managed
-- ---------------------------------------------------------------------------

create table jurisdiction_configs (
  code text primary key,
  child_age_threshold int not null,
  consent_method text not null,
  character_consent_method text not null,
  notice_version text not null,
  residency_region text not null,
  enabled boolean not null default false
);

alter table jurisdiction_configs enable row level security;

create policy "jurisdiction configs are public"
  on jurisdiction_configs for select
  using (true);

insert into jurisdiction_configs
  (code, child_age_threshold, consent_method, character_consent_method, notice_version, residency_region, enabled)
values
  ('US', 13, 'payment_vpc', 'light_attestation', 'us-coppa-v1', 'us-east-1', true),
  ('IN', 18, 'payment_vpc', 'light_attestation', 'in-dpdp-v1', 'ap-south-1', true),
  ('KR', 14, 'signed_form', 'light_attestation', 'kr-pipa-v1', 'ap-northeast-2', false),
  ('SG', 13, 'payment_vpc', 'light_attestation', 'sg-pdpa-v1', 'ap-southeast-1', false),
  ('JP', 13, 'payment_vpc', 'light_attestation', 'jp-appi-v1', 'ap-northeast-1', false),
  ('STRICT', 13, 'payment_vpc', 'payment_vpc', 'strict-v1', 'us-east-1', true);

-- ============================================================
-- supabase/migrations/003_push_and_email_plus_vpc.sql
-- ============================================================
-- Push subscriptions + Email-Plus VPC requests (PRD v4 / issue 32).
-- Closes the last in-memory-only maps in src/db/store.ts.

-- ---------------------------------------------------------------------------
-- Push subscriptions (member-scoped; no family_id)
-- ---------------------------------------------------------------------------

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_member_id_idx on push_subscriptions (member_id);

alter table push_subscriptions enable row level security;

create policy "member manages own push subscriptions"
  on push_subscriptions for all
  using (member_id = app_current_member_id())
  with check (member_id = app_current_member_id());

-- ---------------------------------------------------------------------------
-- Email-Plus VPC requests (Family-scoped; token resolved server-side only)
-- ---------------------------------------------------------------------------

create table email_plus_vpc_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  email text not null,
  status text not null check (
    status in ('requested', 'link_sent', 'confirmed', 'revoked')
  ),
  token text not null,
  notice_version text not null,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table email_plus_vpc_requests enable row level security;

create policy "email plus vpc visible within family"
  on email_plus_vpc_requests for select
  using (family_id = app_current_family_id());

create policy "guardian records email plus vpc"
  on email_plus_vpc_requests for insert
  with check (family_id = app_current_family_id() and app_is_guardian());

create policy "guardian updates email plus vpc"
  on email_plus_vpc_requests for update
  using (family_id = app_current_family_id() and app_is_guardian())
  with check (family_id = app_current_family_id() and app_is_guardian());

-- Ticket 178 incremental schema: consent lifecycle/method and Family-owned
-- Baby/bond RLS. The canonical migration is supabase/migrations/012_...sql.
ALTER TABLE consent_receipts
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE email_plus_vpc_requests
  DROP CONSTRAINT IF EXISTS email_plus_vpc_requests_status_check;
ALTER TABLE email_plus_vpc_requests
  ADD CONSTRAINT email_plus_vpc_requests_status_check
    CHECK (status IN ('requested', 'link_sent', 'confirmed', 'revoked', 'expired'));
ALTER TABLE babies ENABLE ROW LEVEL SECURITY;
ALTER TABLE baby_person_bonds ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- supabase/migrations/013_provider_artifacts_rls_and_delete.sql
-- ============================================================
-- Provider requests/receipts, cost evidence, allowance reservations, and
-- Story Context provenance. URLs from fal are temporary; copied keys are owned.
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
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE babies ENABLE ROW LEVEL SECURITY;
ALTER TABLE baby_person_bonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE storybooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE persisted_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_allowance_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fal_training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fal_webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_cost_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_kill_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_context_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket184 family isolation" ON families FOR ALL USING (id = app_current_family_id()) WITH CHECK (id = app_current_family_id());
CREATE POLICY "ticket184 member isolation" ON members FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 persona isolation" ON personas FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 baby isolation" ON babies FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 bond isolation" ON baby_person_bonds FOR ALL USING (EXISTS (SELECT 1 FROM babies b WHERE b.id = baby_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM babies b JOIN personas p ON p.id = persona_id WHERE b.id = baby_id AND b.family_id = p.family_id AND b.family_id = app_current_family_id()));
CREATE POLICY "ticket184 consent isolation" ON consent_receipts FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 storybook isolation" ON storybooks FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 page isolation" ON pages FOR ALL USING (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id()));
CREATE POLICY "ticket184 candidate isolation" ON page_candidates FOR ALL USING (EXISTS (SELECT 1 FROM pages p JOIN storybooks b ON b.id = p.storybook_id WHERE p.id = page_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM pages p JOIN storybooks b ON b.id = p.storybook_id WHERE p.id = page_id AND b.family_id = app_current_family_id()));
CREATE POLICY "ticket184 generation isolation" ON persisted_generations FOR ALL USING (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id())) WITH CHECK (EXISTS (SELECT 1 FROM storybooks b WHERE b.id = storybook_id AND b.family_id = app_current_family_id()));
CREATE POLICY "ticket184 allowance isolation" ON story_allowance_reservations FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 training isolation" ON fal_training_requests FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 webhook isolation" ON fal_webhook_receipts FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 cost isolation" ON provider_cost_ledger FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "lul108 cost-control isolation" ON provider_kill_switches FOR ALL USING (family_id = app_current_family_id() OR family_id IS NULL) WITH CHECK (family_id = app_current_family_id());
CREATE POLICY "ticket184 provenance isolation" ON story_context_provenance FOR ALL USING (family_id = app_current_family_id()) WITH CHECK (family_id = app_current_family_id());

-- ============================================================
-- supabase/migrations/020_provider_bakeoff_claims.sql
-- ============================================================
-- Service-role-only, restart-safe pre-spend claims for the paid canary.
CREATE TABLE IF NOT EXISTS provider_bakeoff_runs (
  run_id text PRIMARY KEY,
  fixture_manifest_sha256 text NOT NULL CHECK (fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  budget_usd numeric NOT NULL CHECK (budget_usd > 0 AND budget_usd <= 10),
  reserved_usd numeric NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  actual_cost_usd numeric NOT NULL DEFAULT 0 CHECK (actual_cost_usd >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS provider_bakeoff_operations (
  run_id text NOT NULL REFERENCES provider_bakeoff_runs (run_id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('fal', 'anthropic')),
  kind text NOT NULL CHECK (kind IN ('training', 'generation', 'repair', 'story')),
  model text NOT NULL,
  endpoint text NOT NULL,
  fixture_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed', 'succeeded', 'failed', 'unknown_billing')),
  reserved_usd numeric NOT NULL CHECK (reserved_usd > 0),
  actual_cost_usd numeric,
  evidence jsonb,
  error text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (run_id, operation_id)
);
ALTER TABLE provider_bakeoff_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_bakeoff_operations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_begin_provider_bakeoff_run(p_run_id text, p_fixture_manifest_sha256 text, p_budget_usd numeric, p_started_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run provider_bakeoff_runs%ROWTYPE;
BEGIN
  INSERT INTO provider_bakeoff_runs (run_id, fixture_manifest_sha256, budget_usd, started_at) VALUES (p_run_id, p_fixture_manifest_sha256, p_budget_usd, p_started_at) ON CONFLICT (run_id) DO NOTHING;
  SELECT * INTO v_run FROM provider_bakeoff_runs WHERE run_id = p_run_id;
  IF v_run.fixture_manifest_sha256 <> p_fixture_manifest_sha256 OR v_run.budget_usd <> p_budget_usd THEN RAISE EXCEPTION 'A resumed provider bake-off run must use the same fixture and budget'; END IF;
  RETURN to_jsonb(v_run);
END; $$;

CREATE OR REPLACE FUNCTION app_claim_provider_bakeoff_operation(p_run_id text, p_operation_id text, p_provider text, p_kind text, p_model text, p_endpoint text, p_fixture_id text, p_reserved_usd numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run provider_bakeoff_runs%ROWTYPE; v_operation provider_bakeoff_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM provider_bakeoff_runs WHERE run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider bake-off run is missing'; END IF;
  SELECT * INTO v_operation FROM provider_bakeoff_operations WHERE run_id = p_run_id AND operation_id = p_operation_id;
  IF FOUND THEN RETURN to_jsonb(v_operation) || jsonb_build_object('claimed_now', false); END IF;
  IF p_reserved_usd <= 0 OR v_run.reserved_usd + p_reserved_usd > v_run.budget_usd THEN RAISE EXCEPTION 'Provider bake-off budget exceeded before operation %', p_operation_id; END IF;
  UPDATE provider_bakeoff_runs SET reserved_usd = reserved_usd + p_reserved_usd WHERE run_id = p_run_id;
  INSERT INTO provider_bakeoff_operations (run_id, operation_id, provider, kind, model, endpoint, fixture_id, status, reserved_usd) VALUES (p_run_id, p_operation_id, p_provider, p_kind, p_model, p_endpoint, p_fixture_id, 'claimed', p_reserved_usd) RETURNING * INTO v_operation;
  RETURN to_jsonb(v_operation) || jsonb_build_object('claimed_now', true);
END; $$;

CREATE OR REPLACE FUNCTION app_complete_provider_bakeoff_operation(p_run_id text, p_operation_id text, p_status text, p_actual_cost_usd numeric, p_evidence jsonb, p_error text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_operation provider_bakeoff_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM provider_bakeoff_operations WHERE run_id = p_run_id AND operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider bake-off operation claim is missing'; END IF;
  IF v_operation.status <> 'claimed' THEN RETURN to_jsonb(v_operation); END IF;
  IF p_status NOT IN ('succeeded', 'failed') THEN RAISE EXCEPTION 'Provider bake-off terminal status is invalid'; END IF;
  IF p_actual_cost_usd IS NOT NULL AND (p_actual_cost_usd < 0 OR p_actual_cost_usd > v_operation.reserved_usd) THEN RAISE EXCEPTION 'Provider bake-off actual cost exceeds its reservation'; END IF;
  UPDATE provider_bakeoff_operations SET status = p_status, actual_cost_usd = p_actual_cost_usd, evidence = p_evidence, error = left(p_error, 500), completed_at = now() WHERE run_id = p_run_id AND operation_id = p_operation_id RETURNING * INTO v_operation;
  UPDATE provider_bakeoff_runs SET actual_cost_usd = COALESCE((SELECT sum(actual_cost_usd) FROM provider_bakeoff_operations WHERE run_id = p_run_id), 0) WHERE run_id = p_run_id;
  RETURN to_jsonb(v_operation);
END; $$;

CREATE OR REPLACE FUNCTION app_mark_provider_bakeoff_unknown(p_run_id text, p_operation_id text, p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE provider_bakeoff_operations SET status = 'unknown_billing', actual_cost_usd = NULL, evidence = NULL, error = left(p_error, 500), completed_at = now() WHERE run_id = p_run_id AND operation_id = p_operation_id AND status = 'claimed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider bake-off operation claim is missing or already terminal'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION app_complete_provider_bakeoff_run(p_run_id text, p_completed_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM provider_bakeoff_operations WHERE run_id = p_run_id AND status IN ('claimed', 'unknown_billing')) THEN RAISE EXCEPTION 'Provider bake-off run has unreconciled operations'; END IF;
  UPDATE provider_bakeoff_runs SET completed_at = COALESCE(completed_at, p_completed_at) WHERE run_id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider bake-off run is missing'; END IF;
END; $$;

REVOKE ALL ON provider_bakeoff_runs, provider_bakeoff_operations FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_begin_provider_bakeoff_run(text, text, numeric, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_claim_provider_bakeoff_operation(text, text, text, text, text, text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_complete_provider_bakeoff_operation(text, text, text, numeric, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_mark_provider_bakeoff_unknown(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_complete_provider_bakeoff_run(text, timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON provider_bakeoff_runs, provider_bakeoff_operations FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON provider_bakeoff_runs, provider_bakeoff_operations FROM authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON provider_bakeoff_runs, provider_bakeoff_operations TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_begin_provider_bakeoff_run(text, text, numeric, timestamptz) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_claim_provider_bakeoff_operation(text, text, text, text, text, text, text, numeric) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_complete_provider_bakeoff_operation(text, text, text, numeric, jsonb, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_mark_provider_bakeoff_unknown(text, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_complete_provider_bakeoff_run(text, timestamptz) TO service_role';
  END IF;
END $$;


-- ============================================================
-- supabase/migrations/021_likeness_resume_durability.sql
-- ============================================================
-- LUL-105 / Issue 180: pending Brief claims and likeness-review derivatives
-- must survive a SupabaseDataStore hydrate → sync → restart cycle.

ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS review_sample_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE pending_briefs
  ADD COLUMN IF NOT EXISTS selected_persona_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'failed', 'accepted')),
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS storybook_id uuid REFERENCES storybooks (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE pending_briefs
  ADD CONSTRAINT pending_briefs_accepted_requires_storybook
  CHECK (status <> 'accepted' OR storybook_id IS NOT NULL) NOT VALID;

-- A worker can only take a pending/failed Brief or a lease that has expired.
-- The function is service-composed, but its row lock makes process restart and
-- duplicate ready callbacks unable to obtain simultaneous pre-spend claims.
CREATE OR REPLACE FUNCTION app_claim_pending_brief(
  p_key text,
  p_claim_token uuid,
  p_now timestamptz,
  p_lease_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending pending_briefs%ROWTYPE;
BEGIN
  SELECT * INTO v_pending FROM pending_briefs WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending Brief is missing'; END IF;
  IF v_pending.status = 'accepted' THEN RETURN to_jsonb(v_pending) || jsonb_build_object('claimed_now', false); END IF;
  IF v_pending.status = 'running' AND v_pending.claim_expires_at > p_now THEN
    RETURN to_jsonb(v_pending) || jsonb_build_object('claimed_now', false);
  END IF;
  UPDATE pending_briefs
  SET status = 'running', claim_token = p_claim_token,
      claimed_at = p_now, claim_expires_at = p_lease_expires_at,
      error = NULL, failed_at = NULL
  WHERE key = p_key
  RETURNING * INTO v_pending;
  RETURN to_jsonb(v_pending) || jsonb_build_object('claimed_now', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION app_claim_pending_brief(text, uuid, timestamptz, timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_claim_pending_brief(text, uuid, timestamptz, timestamptz) TO service_role';
  END IF;
END $$;

