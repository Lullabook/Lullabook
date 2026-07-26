import { describe, expect, it } from "vitest";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";

describe("178 — PostgreSQL Family RLS integration", () => {
  it("runs the real PostgreSQL engine rather than an in-memory approximation", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const version = await asUser<{ version: string }>(fixture.familyA.authUserId, "select version()");
      expect(version.rows[0]?.version).toMatch(/^PostgreSQL \d+/);
    });
  }, 15_000);

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
      ).rejects.toThrow(/row-level security|permission denied/i);
    });
  });

  it("denies forged consent writes while trusted issuance remains usable for Baby preparation", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const forgedReceiptId = "00000000-0000-0000-0000-000000000991";
      await expect(asUser(
        fixture.familyA.authUserId,
        `insert into consent_receipts (
          id, family_id, member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $3, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
        [forgedReceiptId, fixture.familyA.familyId, fixture.familyA.memberId],
      )).rejects.toThrow(/row-level security|permission denied/i);

      const forgedUpdate = await asUser(
        fixture.familyA.authUserId,
        "update consent_receipts set status = 'revoked' where id = $1",
        [fixture.familyA.consentReceiptId],
      );
      expect(forgedUpdate.rowCount).toBe(0);

      await asService(
        "update consent_receipts set status = 'revoked' where id = $1",
        [fixture.familyA.consentReceiptId],
      );
      const trustedReceiptId = "00000000-0000-0000-0000-000000000992";
      await expect(asService(
        `insert into consent_receipts (
          id, family_id, member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $3, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
        [trustedReceiptId, fixture.familyA.familyId, fixture.familyA.memberId],
      )).resolves.toMatchObject({ rowCount: 1 });

      const prepared = await asUser<{ id: string }>(
        fixture.familyA.authUserId,
        "select id::text from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        ["f".repeat(64), JSON.stringify({ displayName: "Maya" })],
      );
      const reservation = await asUser<{ baby_consent_receipt_id: string }>(
        fixture.familyA.authUserId,
        "select baby_consent_receipt_id::text from persona_creation_reservations where id = $1",
        [prepared.rows[0]!.id],
      );
      expect(reservation.rows[0]?.baby_consent_receipt_id).toBe(trustedReceiptId);
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
      ).rejects.toThrow(/row-level security|permission denied/i);

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

  it("keeps Persona reservations and outbox rows Family-scoped with worker acknowledgements service-only", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const fingerprint = "a".repeat(64);
      const prepared = await asUser<{ id: string }>(
        fixture.familyA.authUserId,
        "select id::text from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        [fingerprint, JSON.stringify({ displayName: "Maya" })],
      );
      const reservationId = prepared.rows[0]!.id;
      const outboxId = "00000000-0000-0000-0000-000000000777";
      await asSystem(
        `insert into persona_creation_outbox (id, family_id, reservation_id, event_type, payload)
         values ($1, $2, $3, 'persona-creation-finalized', '{}'::jsonb)`,
        [outboxId, fixture.familyA.familyId, reservationId],
      );

      for (const table of ["persona_creation_reservations", "persona_creation_outbox"]) {
        const otherFamilyRead = await asUser(
          fixture.familyB.authUserId,
          `select id from ${table} where family_id = $1`,
          [fixture.familyA.familyId],
        );
        const ownDirectMutation = await asUser(
          fixture.familyA.authUserId,
          `update ${table} set family_id = family_id where family_id = $1`,
          [fixture.familyA.familyId],
        );
        expect(otherFamilyRead.rows).toEqual([]);
        expect(ownDirectMutation.rowCount).toBe(0);
      }

      const authenticatedPrivileges = await asUser<{
        claim_cleanup: boolean;
        complete_cleanup: boolean;
        claim_outbox: boolean;
        claim_specific_outbox: boolean;
        mark_sent: boolean;
      }>(
        fixture.familyA.authUserId,
        `select
          has_function_privilege(current_user, 'app_claim_expired_persona_creation_reservations(integer,integer)', 'EXECUTE') as claim_cleanup,
          has_function_privilege(current_user, 'app_complete_persona_creation_expired_cleanup(uuid,uuid)', 'EXECUTE') as complete_cleanup,
          has_function_privilege(current_user, 'app_claim_persona_creation_outbox(integer)', 'EXECUTE') as claim_outbox,
          has_function_privilege(current_user, 'app_claim_persona_creation_outbox_for_reservation(uuid,integer)', 'EXECUTE') as claim_specific_outbox,
          has_function_privilege(current_user, 'app_mark_persona_creation_outbox_sent(uuid,uuid)', 'EXECUTE') as mark_sent`,
      );
      expect(authenticatedPrivileges.rows[0]).toEqual({
        claim_cleanup: false,
        complete_cleanup: false,
        claim_outbox: false,
        claim_specific_outbox: false,
        mark_sent: false,
      });

      const servicePrivileges = await asService<{
        claim_cleanup: boolean;
        complete_cleanup: boolean;
        claim_outbox: boolean;
        claim_specific_outbox: boolean;
        mark_sent: boolean;
      }>(
        `select
          has_function_privilege(current_user, 'app_claim_expired_persona_creation_reservations(integer,integer)', 'EXECUTE') as claim_cleanup,
          has_function_privilege(current_user, 'app_complete_persona_creation_expired_cleanup(uuid,uuid)', 'EXECUTE') as complete_cleanup,
          has_function_privilege(current_user, 'app_claim_persona_creation_outbox(integer)', 'EXECUTE') as claim_outbox,
          has_function_privilege(current_user, 'app_claim_persona_creation_outbox_for_reservation(uuid,integer)', 'EXECUTE') as claim_specific_outbox,
          has_function_privilege(current_user, 'app_mark_persona_creation_outbox_sent(uuid,uuid)', 'EXECUTE') as mark_sent`,
      );
      expect(servicePrivileges.rows[0]).toEqual({
        claim_cleanup: true,
        complete_cleanup: true,
        claim_outbox: true,
        claim_specific_outbox: true,
        mark_sent: true,
      });

      const attemptId = "00000000-0000-0000-0000-000000000778";
      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_claim_persona_creation_upload($1::uuid, $2::uuid)",
        [reservationId, attemptId],
      )).rejects.toThrow(/permission denied/i);
      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
        [reservationId, attemptId, JSON.stringify([])],
      )).rejects.toThrow(/permission denied/i);
      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_finalize_persona_creation($1::uuid)",
        [reservationId],
      )).rejects.toThrow(/permission denied/i);
    });
  });

  it("allows only the owning Guardian or service role to abort an active reservation", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const memberAuthId = "00000000-0000-0000-0000-000000000129";
      const memberId = "00000000-0000-0000-0000-000000000229";
      await asSystem("insert into auth.users (id) values ($1)", [memberAuthId]);
      await asSystem(
        `insert into members (id, auth_user_id, family_id, email, role, jurisdiction)
         values ($1, $2, $3, 'ordinary-member@example.test', 'member', 'US')`,
        [memberId, memberAuthId, fixture.familyA.familyId],
      );

      const guardianReservation = await asUser<{ id: string }>(
        fixture.familyA.authUserId,
        "select id::text from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        ["d".repeat(64), JSON.stringify({ displayName: "Maya" })],
      );
      await expect(asUser(
        memberAuthId,
        "select * from app_abort_persona_creation($1::uuid)",
        [guardianReservation.rows[0]!.id],
      )).rejects.toThrow(/reservation not found|owning Guardian/i);
      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_abort_persona_creation($1::uuid)",
        [guardianReservation.rows[0]!.id],
      )).resolves.toMatchObject({ rows: [{ id: guardianReservation.rows[0]!.id, state: "aborted" }] });

      const serviceReservation = await asUser<{ id: string }>(
        fixture.familyA.authUserId,
        "select id::text from app_prepare_adult_persona_creation('Parent', 1, $1)",
        ["e".repeat(64)],
      );
      await expect(asService(
        "select * from app_abort_persona_creation($1::uuid)",
        [serviceReservation.rows[0]!.id],
      )).resolves.toMatchObject({ rows: [{ id: serviceReservation.rows[0]!.id, state: "aborted" }] });
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

  it("blocks cross-Family protocol inserts, updates, deletes, and outbox manufacture", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const prepared = await asUser<{ id: string; photo_keys: string[] }>(
        fixture.familyB.authUserId,
        "select id::text, photo_keys from app_prepare_persona_creation('baby', 'June', 1, $1, $2::jsonb)",
        ["b".repeat(64), JSON.stringify({ displayName: "June" })],
      );
      const reservationId = prepared.rows[0]!.id;
      const uploadAttemptId = "00000000-0000-0000-0000-000000000887";
      await asService(
        "select * from app_claim_persona_creation_upload($1::uuid, $2::uuid)",
        [reservationId, uploadAttemptId],
      );
      const outboxId = "00000000-0000-0000-0000-000000000889";
      await asSystem(
        `insert into persona_creation_outbox (id, family_id, reservation_id, event_type, payload)
         values ($1, $2, $3, 'persona-creation-finalized', '{}'::jsonb)`,
        [outboxId, fixture.familyB.familyId, reservationId],
      );

      for (const table of [
        "persona_creation_reservations",
        "persona_creation_upload_attempts",
        "persona_creation_outbox",
      ]) {
        const id = table === "persona_creation_reservations"
          ? reservationId
          : table === "persona_creation_upload_attempts"
            ? uploadAttemptId
            : outboxId;
        const updated = await asUser(
          fixture.familyA.authUserId,
          `update ${table} set family_id = family_id where id = $1`,
          [id],
        );
        const deleted = await asUser(fixture.familyA.authUserId, `delete from ${table} where id = $1`, [id]);
        expect(updated.rowCount).toBe(0);
        expect(deleted.rowCount).toBe(0);
      }

      await asSystem(
        `insert into consent_receipts (
          id, family_id, member_id, jurisdiction, notice_version, method, status
        ) values ('00000000-0000-0000-0000-000000000888', $1, $2, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
        [fixture.familyB.familyId, fixture.familyB.memberId],
      );
      await expect(asUser(
        fixture.familyA.authUserId,
        `insert into persona_creation_reservations (
          id, family_id, member_id, request_fingerprint, persona_id, baby_id,
          baby_consent_receipt_id, kind, display_name, baby, photo_keys, state, expires_at
        ) values (
          '00000000-0000-0000-0000-000000000881', $1::uuid, $2::uuid, $3::text,
          '00000000-0000-0000-0000-000000000882',
          '00000000-0000-0000-0000-000000000883',
          '00000000-0000-0000-0000-000000000888', 'baby', 'Cross Family',
          '{"displayName":"Cross Family"}'::jsonb,
          jsonb_build_array('persona-creation/' || $1::text || '/00000000-0000-0000-0000-000000000881/photos/0.jpg'),
          'prepared', now() + interval '30 minutes'
        )`,
        [fixture.familyB.familyId, fixture.familyB.memberId, "c".repeat(64)],
      )).rejects.toThrow(/row-level security/i);

      await expect(asUser(
        fixture.familyA.authUserId,
        `insert into persona_creation_outbox (id, family_id, reservation_id, event_type, payload)
         values ('00000000-0000-0000-0000-000000000884', $1, $2, 'persona-creation-finalized', '{}'::jsonb)`,
        [fixture.familyB.familyId, reservationId],
      )).rejects.toThrow(/row-level security/i);

      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
        [reservationId, "00000000-0000-0000-0000-000000000885", JSON.stringify([])],
      )).rejects.toThrow(/permission denied/i);
      await expect(asService("select * from app_claim_persona_creation_outbox(NULL::integer)"))
        .rejects.toThrow(/lease must be between/i);
    });
  });
});
