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
