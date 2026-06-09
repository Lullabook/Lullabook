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
