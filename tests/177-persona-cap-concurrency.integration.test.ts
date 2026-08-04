import { describe, expect, it } from "vitest";
import { withIsolatedPostgres } from "@/../tests/support/postgres/rls-harness";

describe("177 — database-authoritative R1 Persona capacity", () => {
  it("allows an own-subject Member Adult reservation but keeps Baby creation Guardian-only", async () => {
    await withIsolatedPostgres(async ({ asSystem, asUser, fixture }) => {
      const memberId = "00000000-0000-0000-0000-000000000271";
      const authUserId = "00000000-0000-0000-0000-000000000171";
      await asSystem("insert into auth.users (id) values ($1)", [authUserId]);
      await asSystem(
        "insert into members (id, auth_user_id, family_id, email, role, jurisdiction) values ($1, $2, $3, 'member@example.test', 'member', 'US')",
        [memberId, authUserId, fixture.familyA.familyId],
      );

      await expect(asUser(
        authUserId,
        "select * from app_prepare_adult_persona_creation($1, $2, $3)",
        ["Own Adult", 3, "a".repeat(64)],
      )).resolves.toMatchObject({ rows: [{ state: "prepared" }] });
      await expect(asUser(
        authUserId,
        "select * from app_prepare_persona_creation($1, $2, $3, $4, $5, $6, $7)",
        ["baby", "Not Guardian", 3, "b".repeat(64), { displayName: "Baby" }, null, null],
      )).rejects.toThrow(/guardian authority/i);
    });
  });

  it("serializes mixed-type capacity so concurrent third/fourth attempts persist at most one reservation", async () => {
    await withIsolatedPostgres(async ({ asSystem, asUserConcurrent, fixture }) => {
      await asSystem(
        "insert into personas (family_id, created_by_member_id, kind, display_name, status) values ($1, $2, 'adult', 'Second', 'ready')",
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );

      const attempts = await Promise.allSettled([
        asUserConcurrent(
          fixture.familyA.authUserId,
          "select * from app_prepare_adult_persona_creation($1, $2, $3)",
          ["Third A", 3, "c".repeat(64)],
        ),
        asUserConcurrent(
          fixture.familyA.authUserId,
          "select * from app_prepare_adult_persona_creation($1, $2, $3)",
          ["Third B", 3, "d".repeat(64)],
        ),
      ]);

      expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
      if (attempts[0].status === "rejected") {
        expect(String(attempts[0].reason)).toMatch(/capacity/i);
      }
      if (attempts[1].status === "rejected") {
        expect(String(attempts[1].reason)).toMatch(/capacity/i);
      }

      const counts = await asSystem<{ personas: string; active_reservations: string; outbox: string }>(
        `select
          (select count(*) from personas where family_id = $1) as personas,
          (select count(*) from persona_creation_reservations where family_id = $1 and state in ('prepared', 'uploaded')) as active_reservations,
          (select count(*) from persona_creation_outbox where family_id = $1) as outbox`,
        [fixture.familyA.familyId],
      );
      expect(counts.rows[0]).toEqual({ personas: "2", active_reservations: "1", outbox: "0" });
    });
  });
});
