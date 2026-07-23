import { describe, expect, it } from "vitest";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";

describe("178 — PostgreSQL Family RLS integration", () => {
  it("runs the real PostgreSQL engine rather than an in-memory approximation", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const version = await asUser<{ version: string }>(fixture.familyA.authUserId, "select version()");
      expect(version.rows[0]?.version).toMatch(/^PostgreSQL \d+/);
    });
  });

  it("allows an authenticated Family A Guardian to access only Family A persona records", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const ownPersonas = await asUser(fixture.familyA.authUserId, "select id from personas order by id");
      const ownUpdate = await asUser(
        fixture.familyA.authUserId,
        "update personas set display_name = display_name where id = $1",
        [fixture.familyA.personaId],
      );
      const otherPersonas = await asUser(
        fixture.familyA.authUserId,
        "select id from personas where family_id = $1",
        [fixture.familyB.familyId],
      );

      expect(ownPersonas.rows).toHaveLength(1);
      expect(ownUpdate.rowCount).toBe(1);
      expect(otherPersonas.rows).toEqual([]);
    });
  });

  it("permits a Guardian's scoped operations for every Family A safety record", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const userId = fixture.familyA.authUserId;
      const reads = await Promise.all([
        asUser(userId, "select id from members where id = $1", [fixture.familyA.memberId]),
        asUser(userId, "select id from personas where id = $1", [fixture.familyA.personaId]),
        asUser(userId, "select id from babies where id = $1", [fixture.familyA.babyId]),
        asUser(userId, "select id from baby_person_bonds where id = $1", [fixture.familyA.bondId]),
        asUser(userId, "select id from consent_receipts where id = $1", [fixture.familyA.consentReceiptId]),
      ]);

      for (const read of reads) {
        expect(read.rows).toHaveLength(1);
      }

      const ownMemberUpdate = await asUser(userId, "update members set email = email where id = $1", [
        fixture.familyA.memberId,
      ]);
      expect(ownMemberUpdate.rowCount).toBe(1);

      const ownBabyInsert = await asUser(
        userId,
        "insert into babies (id, family_id, display_name, roster_group_id) values ('00000000-0000-0000-0000-000000000410', $1, 'Permitted Baby', '00000000-0000-0000-0000-000000000410')",
        [fixture.familyA.familyId],
      );
      expect(ownBabyInsert.rowCount).toBe(1);

      const ownBondInsert = await asUser(
        userId,
        "insert into baby_person_bonds (id, baby_id, persona_id) values ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000410', $1)",
        [fixture.familyA.personaId],
      );
      expect(ownBondInsert.rowCount).toBe(1);

      await expect(
        asUser(
          userId,
          "insert into consent_receipts (id, family_id, member_id, jurisdiction, notice_version) values ('00000000-0000-0000-0000-000000000998', $1, $2, 'US', 'test-v2')",
          [fixture.familyA.familyId, fixture.familyA.memberId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  it("uses an authenticated role and blocks Family A from every Family B safety record", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const role = await asUser<{ current_user: string }>(fixture.familyA.authUserId, "select current_user");
      expect(role.rows).toEqual([{ current_user: "authenticated" }]);

      for (const target of [
        { id: fixture.familyB.memberId, table: "members" },
        { id: fixture.familyB.personaId, table: "personas" },
        { id: fixture.familyB.babyId, table: "babies" },
        { id: fixture.familyB.bondId, table: "baby_person_bonds" },
        { id: fixture.familyB.consentReceiptId, table: "consent_receipts" },
      ]) {
        const selected = await asUser(fixture.familyA.authUserId, `select id from ${target.table} where id = $1`, [target.id]);
        const updated = await asUser(fixture.familyA.authUserId, `update ${target.table} set id = id where id = $1`, [target.id]);
        const deleted = await asUser(fixture.familyA.authUserId, `delete from ${target.table} where id = $1`, [target.id]);

        expect(selected.rows).toEqual([]);
        expect(updated.rowCount).toBe(0);
        expect(deleted.rowCount).toBe(0);
      }
    });
  });

  it("keeps each authenticated principal's JWT claim isolated across concurrent queries", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const claims = await Promise.all([
        asUser<{ uid: string }>(fixture.familyA.authUserId, "select auth.uid() as uid"),
        asUser<{ uid: string }>(fixture.familyB.authUserId, "select auth.uid() as uid"),
        asUser<{ uid: string }>(fixture.familyA.authUserId, "select auth.uid() as uid"),
      ]);

      expect(claims.map((claim) => claim.rows[0]?.uid)).toEqual([
        fixture.familyA.authUserId,
        fixture.familyB.authUserId,
        fixture.familyA.authUserId,
      ]);
    });
  });

  it("runs Family B as an authenticated principal with its own permitted and forbidden operations", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const userId = fixture.familyB.authUserId;

      const role = await asUser<{ current_user: string }>(userId, "select current_user");
      expect(role.rows).toEqual([{ current_user: "authenticated" }]);

      const ownReads = await Promise.all([
        asUser(userId, "select id from members where id = $1", [fixture.familyB.memberId]),
        asUser(userId, "select id from personas where id = $1", [fixture.familyB.personaId]),
        asUser(userId, "select id from babies where id = $1", [fixture.familyB.babyId]),
        asUser(userId, "select id from baby_person_bonds where id = $1", [fixture.familyB.bondId]),
        asUser(userId, "select id from consent_receipts where id = $1", [fixture.familyB.consentReceiptId]),
      ]);
      for (const read of ownReads) {
        expect(read.rows).toHaveLength(1);
      }

      await expect(
        asUser(
          userId,
          "insert into consent_receipts (id, family_id, member_id, jurisdiction, notice_version) values ('00000000-0000-0000-0000-000000000999', $1, $2, 'US', 'test-v2')",
          [fixture.familyB.familyId, fixture.familyB.memberId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      for (const target of [
        { id: fixture.familyA.memberId, table: "members" },
        { id: fixture.familyA.personaId, table: "personas" },
        { id: fixture.familyA.babyId, table: "babies" },
        { id: fixture.familyA.bondId, table: "baby_person_bonds" },
        { id: fixture.familyA.consentReceiptId, table: "consent_receipts" },
      ]) {
        const selected = await asUser(userId, `select id from ${target.table} where id = $1`, [target.id]);
        const updated = await asUser(userId, `update ${target.table} set id = id where id = $1`, [target.id]);
        const deleted = await asUser(userId, `delete from ${target.table} where id = $1`, [target.id]);

        expect(selected.rows).toEqual([]);
        expect(updated.rowCount).toBe(0);
        expect(deleted.rowCount).toBe(0);
      }

      await expect(
        asUser(
          userId,
          "insert into consent_receipts (id, family_id, member_id, jurisdiction, notice_version) values ('00000000-0000-0000-0000-000000000996', $1, $2, 'US', 'test-v1')",
          [fixture.familyA.familyId, fixture.familyA.memberId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("rejects Family B inserts even when every referenced record is valid", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      for (const insertion of [
        {
          sql: "insert into members (id, auth_user_id, family_id, email, role, jurisdiction) values ('00000000-0000-0000-0000-000000000990', $1, $2, 'cross-family@example.test', 'member', 'US')",
          values: [fixture.familyA.authUserId, fixture.familyB.familyId],
        },
        {
          sql: "insert into personas (id, family_id, created_by_member_id, kind, display_name, status) values ('00000000-0000-0000-0000-000000000991', $1, $2, 'adult', 'Cross-family Persona', 'ready')",
          values: [fixture.familyB.familyId, fixture.familyA.memberId],
        },
        {
          sql: "insert into babies (id, family_id, display_name, roster_group_id) values ('00000000-0000-0000-0000-000000000992', $1, 'Cross-family Baby', '00000000-0000-0000-0000-000000000993')",
          values: [fixture.familyB.familyId],
        },
        {
          sql: "insert into baby_person_bonds (id, baby_id, persona_id) values ('00000000-0000-0000-0000-000000000994', $1, $2)",
          values: [fixture.familyB.babyId, fixture.familyA.personaId],
        },
        {
          sql: "insert into consent_receipts (id, family_id, member_id, jurisdiction, notice_version) values ('00000000-0000-0000-0000-000000000995', $1, $2, 'US', 'test-v1')",
          values: [fixture.familyB.familyId, fixture.familyA.memberId],
        },
      ]) {
        await expect(asUser(fixture.familyA.authUserId, insertion.sql, insertion.values)).rejects.toThrow(/row-level security/i);
      }
    });
  });
});
