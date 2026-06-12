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
