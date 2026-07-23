import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client, type QueryResult, type QueryResultRow } from "pg";
import { PostgresInstance } from "pg-embedded";

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), "supabase/migrations");

export interface RlsFixture {
  familyId: string;
  authUserId: string;
  memberId: string;
  personaId: string;
  babyId: string;
  bondId: string;
  consentReceiptId: string;
}

interface IsolatedPostgres {
  asUser<Row extends QueryResultRow = QueryResultRow>(
    authUserId: string,
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  fixture: {
    familyA: RlsFixture;
    familyB: RlsFixture;
  };
}

export async function withIsolatedPostgres(
  assertion: (database: IsolatedPostgres) => Promise<void>,
): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "lullabook-postgres-"));
  const instance = new PostgresInstance({
    dataDir,
    password: "local-test-password",
    persistent: false,
    port: 0,
    setupTimeout: 60,
    username: "postgres",
  });

  let client: Client | undefined;
  try {
    await instance.start();
    client = new Client({ connectionString: instance.connectionInfo.connectionString });
    await client.connect();
    await bootstrapSupabaseCompatibility(client);
    await applyMigrations(client);
    const fixture = await seedFixtures(client);

    await assertion({
      asUser: (authUserId, text, values = []) => asAuthenticatedUser(client!, authUserId, text, values),
      fixture,
    });
  } finally {
    await client?.end();
    await instance.cleanup();
    await rm(dataDir, { force: true, recursive: true });
  }
}

async function bootstrapSupabaseCompatibility(client: Client): Promise<void> {
  await client.query(`
    create extension if not exists pgcrypto;
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
  `);
}

async function applyMigrations(client: Client): Promise<void> {
  for (let number = 1; number <= 13; number += 1) {
    const filename = `${String(number).padStart(3, "0")}_${migrationStem(number)}.sql`;
    const sql = await readFile(join(MIGRATIONS_DIRECTORY, filename), "utf8");
    await client.query(sql);
  }
  await client.query("grant select, insert, update, delete on all tables in schema public to authenticated");
}

function migrationStem(number: number): string {
  const stems = [
    "families_rls",
    "full_domain",
    "push_and_email_plus_vpc",
    "maya_world",
    "character_description",
    "moments",
    "journal_moments_extras",
    "avatar_key",
    "baby_birthdate",
    "baby_daily_routine",
    "likeness_confirmed",
    "atomic_consent_safe_persona",
    "provider_artifacts_rls_and_delete",
  ];
  return stems[number - 1]!;
}

async function seedFixtures(client: Client): Promise<{ familyA: RlsFixture; familyB: RlsFixture }> {
  const familyA = fixture("1");
  const familyB = fixture("2");

  for (const entry of [familyA, familyB]) {
    await client.query("insert into auth.users (id) values ($1)", [entry.authUserId]);
    await client.query("insert into families (id) values ($1)", [entry.familyId]);
    await client.query(
      "insert into members (id, auth_user_id, family_id, email, role, jurisdiction) values ($1, $2, $3, $4, 'guardian', 'US')",
      [entry.memberId, entry.authUserId, entry.familyId, `${entry.memberId}@example.test`],
    );
    await client.query(
      "insert into personas (id, family_id, created_by_member_id, kind, display_name, status) values ($1, $2, $3, 'baby', 'Persona', 'ready')",
      [entry.personaId, entry.familyId, entry.memberId],
    );
    await client.query(
      "insert into babies (id, family_id, display_name, roster_group_id) values ($1, $2, 'Baby', $3)",
      [entry.babyId, entry.familyId, entry.babyId],
    );
    await client.query(
      "insert into baby_person_bonds (id, baby_id, persona_id) values ($1, $2, $3)",
      [entry.bondId, entry.babyId, entry.personaId],
    );
    await client.query(
      "insert into consent_receipts (id, family_id, member_id, jurisdiction, notice_version) values ($1, $2, $3, 'US', 'test-v1')",
      [entry.consentReceiptId, entry.familyId, entry.memberId],
    );
  }

  return { familyA, familyB };
}

function fixture(family: "1" | "2"): RlsFixture {
  return {
    authUserId: `00000000-0000-0000-0000-00000000010${family}`,
    babyId: `00000000-0000-0000-0000-00000000040${family}`,
    bondId: `00000000-0000-0000-0000-00000000050${family}`,
    consentReceiptId: `00000000-0000-0000-0000-00000000060${family}`,
    familyId: `00000000-0000-0000-0000-00000000000${family}`,
    memberId: `00000000-0000-0000-0000-00000000020${family}`,
    personaId: `00000000-0000-0000-0000-00000000030${family}`,
  };
}

async function asAuthenticatedUser<Row extends QueryResultRow>(
  client: Client,
  authUserId: string,
  text: string,
  values: unknown[],
): Promise<QueryResult<Row>> {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
    const result = await client.query<Row>(text, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
