#!/usr/bin/env bash
# Apply supabase/migrations/001→003 to a throwaway Postgres (CI smoke check).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/postgres}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

echo "Migration smoke: applying to $DATABASE_URL"

"${PSQL[@]}" <<'SQL'
create extension if not exists "pgcrypto";
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
SQL

for file in "$MIGRATIONS_DIR"/001_*.sql "$MIGRATIONS_DIR"/002_*.sql "$MIGRATIONS_DIR"/003_*.sql; do
  if [[ ! -f "$file" ]]; then
    echo "Missing migration: $file" >&2
    exit 1
  fi
  echo "  → $(basename "$file")"
  "${PSQL[@]}" -f "$file"
done

echo "Migration smoke: OK"
