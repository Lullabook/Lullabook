import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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

export interface IsolatedPostgres {
  asSystem<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  asUser<Row extends QueryResultRow = QueryResultRow>(
    authUserId: string,
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  asService<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  asUserConcurrent<Row extends QueryResultRow = QueryResultRow>(
    authUserId: string,
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  asServiceConcurrent<Row extends QueryResultRow = QueryResultRow>(
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

    await assertion(createDatabaseFacade(
      client,
      instance.connectionInfo.connectionString,
      fixture,
    ));
  } finally {
    try {
      await client?.end();
    } finally {
      try {
        await instance.cleanup();
      } finally {
        await rm(dataDir, { force: true, recursive: true });
      }
    }
  }
}

/** Apply 001-016, seed deployed rows, then apply 017 to prove forward safety. */
export async function withPersonaProtocolUpgradeFrom016(
  beforeUpgrade: (database: IsolatedPostgres) => Promise<void>,
  assertion: (database: IsolatedPostgres) => Promise<void>,
): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "lullabook-postgres-upgrade-"));
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
    await applyMigrations(client, "016_production_persona_entrypoint.sql");
    const fixture = await seedFixtures(client);
    const database = createDatabaseFacade(client, instance.connectionInfo.connectionString, fixture);
    await beforeUpgrade(database);
    await applyMigration(client, "017_persona_creation_protocol_hardening.sql");
    await client.query("grant select, insert, update, delete on all tables in schema public to authenticated, service_role");
    await assertion(database);
  } finally {
    try {
      await client?.end();
    } finally {
      try {
        await instance.cleanup();
      } finally {
        await rm(dataDir, { force: true, recursive: true });
      }
    }
  }
}

function createDatabaseFacade(
  client: Client,
  connectionString: string,
  fixture: { familyA: RlsFixture; familyB: RlsFixture },
): IsolatedPostgres {
  // A single pg.Client serializes its query queue but interleaves statements
  // from concurrent transactions. Chain role-bound transactions as one unit.
  let queue: Promise<unknown> = Promise.resolve();
  const asUser = <Row extends QueryResultRow = QueryResultRow>(
    authUserId: string,
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> => {
    const run = queue.then(() => asAuthenticatedUser<Row>(client, authUserId, text, values));
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  const asService = <Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> => {
    const run = queue.then(() => asDatabaseRole<Row>(client, "service_role", text, values));
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  return {
    asSystem: <Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) =>
      client.query<Row>(text, values),
    asUser,
    asService,
    asUserConcurrent: <Row extends QueryResultRow = QueryResultRow>(
      authUserId: string,
      text: string,
      values: unknown[] = [],
    ) => withConcurrentRole<Row>(connectionString, "authenticated", authUserId, text, values),
    asServiceConcurrent: <Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values: unknown[] = [],
    ) => withConcurrentRole<Row>(connectionString, "service_role", null, text, values),
    fixture,
  };
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
    create role service_role nologin bypassrls;
    grant usage on schema public, auth to authenticated, service_role;
  `);
}

async function applyMigrations(client: Client, throughFilename?: string): Promise<void> {
  const filenames = (await readdir(MIGRATIONS_DIRECTORY))
    .filter((filename) => /^\d{3}_.+\.sql$/.test(filename))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  if (filenames.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIRECTORY}`);
  }

  filenames.forEach((filename, index) => {
    const expected = String(index + 1).padStart(3, "0");
    if (!filename.startsWith(`${expected}_`)) {
      throw new Error(`Migration sequence gap: expected ${expected}_*.sql, found ${filename}`);
    }
  });

  for (const filename of filenames) {
    await applyMigration(client, filename);
    if (filename === throughFilename) break;
  }
  if (throughFilename && !filenames.includes(throughFilename)) {
    throw new Error(`Migration not found: ${throughFilename}`);
  }
  await client.query("grant select, insert, update, delete on all tables in schema public to authenticated, service_role");
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  const sql = await readFile(join(MIGRATIONS_DIRECTORY, filename), "utf8");
  await client.query(sql);
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
      "insert into consent_receipts (id, family_id, member_id, jurisdiction, notice_version, method, status) values ($1, $2, $3, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')",
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

async function withConcurrentRole<Row extends QueryResultRow>(
  connectionString: string,
  role: "authenticated" | "service_role",
  authUserId: string | null,
  text: string,
  values: unknown[],
): Promise<QueryResult<Row>> {
  const concurrentClient = new Client({ connectionString });
  await concurrentClient.connect();
  try {
    await concurrentClient.query("begin");
    await concurrentClient.query(`set local role ${role}`);
    if (authUserId) {
      await concurrentClient.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
    }
    const result = await concurrentClient.query<Row>(text, values);
    await concurrentClient.query("commit");
    return result;
  } catch (error) {
    await concurrentClient.query("rollback");
    throw error;
  } finally {
    await concurrentClient.end();
  }
}

async function asDatabaseRole<Row extends QueryResultRow>(
  client: Client,
  role: "service_role",
  text: string,
  values: unknown[],
): Promise<QueryResult<Row>> {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    const result = await client.query<Row>(text, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
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
