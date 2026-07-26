import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PersonaCreationOutboxConsumer,
  PersonaCreationOutboxDispatcher,
  PostgresPersonaCreationRepository,
  PostgresPersonaCreationWorkerRepository,
  PersonaCreationProtocol,
} from "@/db/persona-creation-protocol";
import { InMemoryBlobStore } from "@/adapters/fakes";
import { FakeWorkflow } from "@/adapters/fakes";
import { workflowEventFromPayload } from "@/adapters/inngest";
import { runPersonaCreationRecoveryWorker } from "@/workflows/functions";
import {
  withIsolatedPostgres,
  withPersonaProtocolUpgradeFrom016,
} from "@/../tests/support/postgres/rls-harness";

describe("178 — PostgreSQL Persona creation protocol", () => {
  it("reserves immutable Family-owned IDs and keys without creating domain rows or an outbox event", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const requestFingerprint = createHash("sha256")
        .update("family-a-baby-maya-v1")
        .digest("hex");

      const prepared = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 3,
        requestFingerprint,
        baby: { displayName: "Maya", birthDate: "2024-02-03" },
        bond: { relationship: "daughter", babyCallsThem: "Mama", theyCallBaby: "Moonbeam" },
      });

      expect(prepared).toMatchObject({ familyId: fixture.familyA.familyId, state: "prepared" });
      expect(prepared.photoKeys).toHaveLength(3);
      expect(prepared.photoKeys.every((key) => key.startsWith(`persona-creation/${fixture.familyA.familyId}/${prepared.id}/`))).toBe(true);

      const domainRows = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        `select (select count(*) from personas where family_id = $1)
          + (select count(*) from babies where family_id = $1)
          + (select count(*) from baby_person_bonds) as count`,
        [fixture.familyA.familyId],
      );
      expect(domainRows.rows[0]?.count).toBe("3");

      const outbox = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_outbox where family_id = $1",
        [fixture.familyA.familyId],
      );
      expect(outbox.rows[0]?.count).toBe("0");
    });
  }, 15_000);

  it("returns one reservation for concurrent duplicate prepare calls on separate connections", async () => {
    await withIsolatedPostgres(async ({ asUserConcurrent, fixture }) => {
      const fingerprint = createHash("sha256").update("concurrent-duplicate-prepare-v1").digest("hex");
      const prepare = () => asUserConcurrent<{ id: string }>(
        fixture.familyA.authUserId,
        "select id::text from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        [fingerprint, JSON.stringify({ displayName: "Maya" })],
      );

      const [first, second] = await Promise.all([prepare(), prepare()]);
      expect(first.rows[0]?.id).toBe(second.rows[0]?.id);
    });
  });

  it("admits at most one concurrent reservation for the final Family capacity slot", async () => {
    await withIsolatedPostgres(async ({ asSystem, asUserConcurrent, fixture }) => {
      await asSystem(
        `insert into personas (family_id, created_by_member_id, kind, display_name, status)
         values ($1, $2, 'adult', 'Second Persona', 'ready')`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      await asSystem(
        `insert into consent_receipts (
          family_id, member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const prepare = (label: string) => asUserConcurrent(
        fixture.familyA.authUserId,
        "select id from app_prepare_persona_creation('baby', $1, 1, $2, $3::jsonb)",
        [label, createHash("sha256").update(label).digest("hex"), JSON.stringify({ displayName: label })],
      );

      const results = await Promise.allSettled([prepare("Capacity A"), prepare("Capacity B")]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    });
  });

  it("reserves and revalidates the exact canonical receipt for Baby creation", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      await asService(
        `insert into consent_receipts (
          family_id, member_id, subject_member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $2, 'US', 'adult-self-v1', 'signed_form', 'verified')`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const prepared = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("exact-baby-consent-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const reserved = await asUser<{ baby_consent_receipt_id: string }>(
        fixture.familyA.authUserId,
        "select baby_consent_receipt_id::text from persona_creation_reservations where id = $1",
        [prepared.id],
      );
      expect(reserved.rows[0]?.baby_consent_receipt_id).toBe(fixture.familyA.consentReceiptId);

      const attemptId = "00000000-0000-0000-0000-000000000711";
      const claimed = await asService<{ photo_keys: string[] }>(
        "select * from app_claim_persona_creation_upload($1::uuid, $2::uuid)",
        [prepared.id, attemptId],
      );
      await asService(
        "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
        [prepared.id, attemptId, JSON.stringify([{
          key: claimed.rows[0]!.photo_keys[0],
          sha256: createHash("sha256").update("baby-photo").digest("hex"),
          size: 10,
        }])],
      );
      await asSystem("update consent_receipts set status = 'revoked' where id = $1", [fixture.familyA.consentReceiptId]);

      await expect(asService(
        "select * from app_finalize_persona_creation($1::uuid)",
        [prepared.id],
      )).rejects.toThrow(/exact.*canonical Baby consent|canonical.*Baby consent/i);
    });
  });

  it.each([
    { label: "accepts canonical US payment VPC", jurisdiction: "US", method: "payment_vpc", notice: "us-coppa-v1", accepted: true },
    { label: "rejects Email-Plus for US", jurisdiction: "US", method: "email_plus", notice: "us-coppa-v1", accepted: false },
    { label: "rejects a noncanonical US notice", jurisdiction: "US", method: "payment_vpc", notice: "wrong-notice", accepted: false },
    { label: "accepts canonical US iOS Email-Plus", jurisdiction: "US_IOS", method: "email_plus", notice: "us-coppa-v1", accepted: true },
    { label: "rejects payment VPC for US iOS", jurisdiction: "US_IOS", method: "payment_vpc", notice: "us-coppa-v1", accepted: false },
    { label: "rejects a noncanonical US iOS notice", jurisdiction: "US_IOS", method: "email_plus", notice: "wrong-notice", accepted: false },
  ])("$label for Baby preparation", async ({ jurisdiction, method, notice, accepted }) => {
    await withIsolatedPostgres(async ({ asSystem, asUser, fixture }) => {
      await asSystem("update members set jurisdiction = $1 where id = $2", [
        jurisdiction,
        fixture.familyA.memberId,
      ]);
      await asSystem(
        `update consent_receipts
         set jurisdiction = $1, method = $2, notice_version = $3
         where id = $4`,
        [jurisdiction, method, notice, fixture.familyA.consentReceiptId],
      );
      const prepare = asUser(
        fixture.familyA.authUserId,
        "select * from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        [
          createHash("sha256").update(`canonical-consent-${jurisdiction}-${method}-${notice}`).digest("hex"),
          JSON.stringify({ displayName: "Maya" }),
        ],
      );

      if (accepted) {
        await expect(prepare).resolves.toMatchObject({ rowCount: 1 });
      } else {
        await expect(prepare).rejects.toThrow(/canonical.*Baby consent/i);
      }
    });
  });

  it("rejects unknown sensitive Baby, bond, and manifest keys before persistence", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        [
          createHash("sha256").update("unknown-baby-key-v1").digest("hex"),
          JSON.stringify({ displayName: "Maya", rawPhotoBase64: "sensitive-photo-bytes" }),
        ],
      )).rejects.toThrow(/Invalid Baby link data/i);

      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb, $3::jsonb)",
        [
          createHash("sha256").update("unknown-bond-key-v1").digest("hex"),
          JSON.stringify({ displayName: "Maya" }),
          JSON.stringify({
            relationship: "daughter",
            babyCallsThem: "Mama",
            theyCallBaby: "Moonbeam",
            providerSecret: "sensitive-provider-secret",
          }),
        ],
      )).rejects.toThrow(/Invalid Baby bond data/i);

      const prepared = await asUser<{ id: string }>(
        fixture.familyA.authUserId,
        "select id::text from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
        [
          createHash("sha256").update("unknown-manifest-key-v1").digest("hex"),
          JSON.stringify({ displayName: "Maya" }),
        ],
      );
      const reservationId = prepared.rows[0]!.id;
      const attemptId = "00000000-0000-0000-0000-000000000712";
      const claimed = await asService<{ photo_keys: string[] }>(
        "select photo_keys from app_claim_persona_creation_upload($1::uuid, $2::uuid)",
        [reservationId, attemptId],
      );
      await expect(asService(
        "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
        [reservationId, attemptId, JSON.stringify([{
          key: claimed.rows[0]!.photo_keys[0],
          sha256: createHash("sha256").update("moderated-photo").digest("hex"),
          size: 15,
          rawBytes: "sensitive-photo-bytes",
        }])],
      )).rejects.toThrow(/Invalid Persona creation photo manifest/i);

      const persisted = await asUser<{
        sensitive_reservations: string;
        reservation_manifest: unknown[];
        attempt_manifest: unknown[];
      }>(
        fixture.familyA.authUserId,
        `select
          (select count(*) from persona_creation_reservations
           where baby::text like '%sensitive-%' or bond::text like '%sensitive-%') as sensitive_reservations,
          (select photo_manifest from persona_creation_reservations where id = $1) as reservation_manifest,
          (select photo_manifest from persona_creation_upload_attempts where id = $2) as attempt_manifest`,
        [reservationId, attemptId],
      );
      expect(persisted.rows[0]).toEqual({
        sensitive_reservations: "0",
        reservation_manifest: [],
        attempt_manifest: [],
      });
    });
  });

  it("finalizes the reserved graph and exactly one byte-free outbox event after every manifest is recorded", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const prepared = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 3,
        requestFingerprint: createHash("sha256").update("finalize-maya-v1").digest("hex"),
        baby: { displayName: "Maya" },
        bond: { relationship: "daughter", babyCallsThem: "Mama", theyCallBaby: "Moonbeam" },
      });

      const uploadAttemptId = "00000000-0000-0000-0000-000000000701";
      const claimed = await repository.claimUpload(prepared.id, uploadAttemptId);
      await repository.markUploaded(
        prepared.id,
        uploadAttemptId,
        claimed!.photoKeys.map((key, index) => ({
          key,
          sha256: createHash("sha256").update(`moderated-photo-${index}`).digest("hex"),
          size: 20_000,
        })),
      );
      const finalized = await repository.finalize(prepared.id);
      expect(finalized).toMatchObject({ id: prepared.id, state: "finalized" });

      const rows = await asUser<{ personas: string; babies: string; bonds: string; outbox: string; payload: string }>(
        fixture.familyA.authUserId,
        `select
          (select count(*) from personas where family_id = $1) as personas,
          (select count(*) from babies where family_id = $1) as babies,
          (select count(*) from baby_person_bonds) as bonds,
          (select count(*) from persona_creation_outbox where family_id = $1) as outbox,
          (select payload::text from persona_creation_outbox where reservation_id = $2) as payload`,
        [fixture.familyA.familyId, prepared.id],
      );
      expect(rows.rows[0]).toMatchObject({ personas: "2", babies: "2", bonds: "2", outbox: "1" });
      expect(rows.rows[0]?.payload).toContain(prepared.id);
      expect(rows.rows[0]?.payload).not.toContain("moderated-photo");
    });
  });

  it("requires a durable Adult subject-consent receipt and links it when an optional Baby and bond finalize", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const receipt = await asService<{ id: string }>(
        `insert into consent_receipts (
          family_id, member_id, subject_member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $2, 'US', 'adult-self-consent-v1', 'signed_form', 'verified') returning id`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const prepared = await repository.prepare({
        kind: "adult",
        displayName: "Parent",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("adult-parent-v1").digest("hex"),
        adultConsentReceiptId: receipt.rows[0]!.id,
        baby: { displayName: "Maya" },
        bond: { relationship: "parent", babyCallsThem: "Mama", theyCallBaby: "Moonbeam" },
      });
      const uploadAttemptId = "00000000-0000-0000-0000-000000000702";
      const claimed = await repository.claimUpload(prepared.id, uploadAttemptId);
      await repository.markUploaded(prepared.id, uploadAttemptId, claimed!.photoKeys.map((key) => ({
        key,
        sha256: createHash("sha256").update(key).digest("hex"),
        size: 20_000,
      })));
      await repository.finalize(prepared.id);

      const rows = await asUser<{ babies: string; bonds: string; subject_persona_id: string; reservation_persona_id: string }>(
        fixture.familyA.authUserId,
        `select
          (select count(*) from babies where family_id = $1) as babies,
          (select count(*) from baby_person_bonds) as bonds,
          (select subject_persona_id::text from consent_receipts where id = $2) as subject_persona_id,
          (select persona_id::text from persona_creation_reservations where id = $3) as reservation_persona_id`,
        [fixture.familyA.familyId, receipt.rows[0]!.id, prepared.id],
      );
      expect(rows.rows[0]).toMatchObject({ babies: "2", bonds: "2" });
      expect(rows.rows[0]?.subject_persona_id).toBe(rows.rows[0]?.reservation_persona_id);
    });
  });

  it("refuses to reserve a second Adult Persona against a consent receipt already claimed by another creation", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const receipt = await asService<{ id: string }>(
        `insert into consent_receipts (
          family_id, member_id, subject_member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $2, 'US', 'adult-self-consent-v1', 'signed_form', 'verified') returning id`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      await repository.prepare({
        kind: "adult",
        displayName: "Parent One",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("adult-consent-one-v1").digest("hex"),
        adultConsentReceiptId: receipt.rows[0]!.id,
      });

      await expect(repository.prepare({
        kind: "adult",
        displayName: "Parent Two",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("adult-consent-two-v1").digest("hex"),
        adultConsentReceiptId: receipt.rows[0]!.id,
      })).rejects.toThrow(/adult consent receipt.*already reserved|duplicate key/i);
    });
  });

  it("aborts an Adult reservation without violating the receipt foreign key", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const fingerprint = createHash("sha256").update("adult-abort-v1").digest("hex");
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const prepared = await asUser<{ id: string; state: string }>(
        fixture.familyA.authUserId,
        "select id::text, state from app_prepare_adult_persona_creation($1, $2, $3)",
        ["Parent", 1, fingerprint],
      );

      await expect(repository.abort(prepared.rows[0]!.id)).resolves.toBeUndefined();
      await new PersonaCreationProtocol(repository, new InMemoryBlobStore(), worker).reconcileExpiredReservations();

      const rows = await asUser<{ reservations: string; receipts: string }>(
        fixture.familyA.authUserId,
        `select
          (select count(*) from persona_creation_reservations where request_fingerprint = $1) as reservations,
          (select count(*) from consent_receipts where notice_version = 'r1-adult-persona-v1') as receipts`,
        [fingerprint],
      );
      expect(rows.rows[0]).toEqual({ reservations: "0", receipts: "0" });
    });
  });

  it.each(["baby", "adult"] as const)(
    "revalidates Guardian authority when finalizing a %s Persona",
    async (kind) => {
      await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
        const fingerprint = createHash("sha256").update(`guardian-demotion-${kind}-v1`).digest("hex");
        const prepared = kind === "baby"
          ? await new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService).prepare({
              kind,
              displayName: "Maya",
              photoCount: 1,
              requestFingerprint: fingerprint,
              baby: { displayName: "Maya" },
            })
          : (await asUser<{ id: string; family_id: string; state: "prepared"; photo_keys: string[] }>(
              fixture.familyA.authUserId,
              "select * from app_prepare_adult_persona_creation($1, $2, $3)",
              ["Parent", 1, fingerprint],
            )).rows[0]!;
        const reservationId = "familyId" in prepared ? prepared.id : prepared.id;
        const attemptId = kind === "baby"
          ? "00000000-0000-0000-0000-000000000721"
          : "00000000-0000-0000-0000-000000000722";
        const claimed = await asService<{ photo_keys: string[] }>(
          "select * from app_claim_persona_creation_upload($1::uuid, $2::uuid)",
          [reservationId, attemptId],
        );
        await asService(
          "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
          [reservationId, attemptId, JSON.stringify([{
            key: claimed.rows[0]!.photo_keys[0],
            sha256: createHash("sha256").update(`${kind}-photo`).digest("hex"),
            size: 10,
          }])],
        );
        await asSystem("update members set role = 'member' where id = $1", [fixture.familyA.memberId]);

        await expect(asService(
          "select * from app_finalize_persona_creation($1::uuid)",
          [reservationId],
        )).rejects.toThrow(/Guardian authority is required/i);
      });
    },
  );

  it("records Adult self-consent inside the authenticated reservation transaction without retry orphaning", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const fingerprint = createHash("sha256").update("adult-self-consent-rpc-v1").digest("hex");
      const first = await asUser<{ id: string; state: string }>(
        fixture.familyA.authUserId,
        "select id::text, state from app_prepare_adult_persona_creation($1, $2, $3)",
        ["Parent", 1, fingerprint],
      );
      const second = await asUser<{ id: string; state: string }>(
        fixture.familyA.authUserId,
        "select id::text, state from app_prepare_adult_persona_creation($1, $2, $3)",
        ["Parent", 1, fingerprint],
      );
      const receipts = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from consent_receipts where family_id = $1 and method = 'signed_form'",
        [fixture.familyA.familyId],
      );

      expect(first.rows[0]).toMatchObject({ state: "prepared" });
      expect(second.rows[0]?.id).toBe(first.rows[0]?.id);
      expect(receipts.rows[0]?.count).toBe("1");
    });
  });

  it("compensates every creation-scoped blob and aborts the reservation when an upload fails", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      class FailSecondWriteBlobStore extends InMemoryBlobStore {
        private writes = 0;
        override async put(key: string, bytes: Buffer): Promise<void> {
          this.writes += 1;
          if (this.writes === 2) throw new Error("simulated blob write failure");
          await super.put(key, bytes);
        }
      }

      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 3,
        requestFingerprint: createHash("sha256").update("blob-compensation-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const blobs = new FailSecondWriteBlobStore();
      const protocol = new PersonaCreationProtocol(repository, blobs);

      await expect(protocol.uploadModeratedPhotos(reservation, [
        Buffer.from("moderated-1"),
        Buffer.from("moderated-2"),
        Buffer.from("moderated-3"),
      ])).rejects.toThrow(/blob write failure/i);
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${reservation.id}/`)).toEqual([]);

      const state = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(state.rows[0]?.count).toBe("0");
    });
  });

  it("retries a failed creation-scoped blob deletion before removing the aborted reservation", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      class FailFirstDeleteBlobStore extends InMemoryBlobStore {
        private failed = false;
        override async delete(key: string): Promise<void> {
          if (!this.failed) {
            this.failed = true;
            throw new Error("simulated blob deletion failure");
          }
          await super.delete(key);
        }
      }

      class FailSecondWriteBlobStore extends FailFirstDeleteBlobStore {
        private writes = 0;
        override async put(key: string, bytes: Buffer): Promise<void> {
          this.writes += 1;
          if (this.writes === 2) throw new Error("simulated blob write failure");
          await super.put(key, bytes);
        }
      }

      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 2,
        requestFingerprint: createHash("sha256").update("blob-delete-retry-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const blobs = new FailSecondWriteBlobStore();
      const protocol = new PersonaCreationProtocol(repository, blobs, worker);

      await expect(protocol.uploadModeratedPhotos(reservation, [
        Buffer.from("moderated-1"),
        Buffer.from("moderated-2"),
      ])).rejects.toThrow(/blob write failure/i);
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${reservation.id}/`)).toHaveLength(1);

      await expect(protocol.reconcileExpiredReservations()).resolves.toBeUndefined();
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${reservation.id}/`)).toEqual([]);
      const rows = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(rows.rows[0]?.count).toBe("0");
    });
  });

  it("eventually cleans reservation blobs after more than ten transient delete failures", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      class FailTenDeletesBlobStore extends InMemoryBlobStore {
        public deleteCalls = 0;
        override async delete(key: string): Promise<void> {
          this.deleteCalls += 1;
          if (this.deleteCalls <= 10) throw new Error("simulated transient blob delete failure");
          await super.delete(key);
        }
      }

      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("reservation-delete-recovery-after-ten-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const blobs = new FailTenDeletesBlobStore();
      await blobs.put(reservation.photoKeys[0]!, Buffer.from("moderated-photo"));
      await repository.abort(reservation.id);
      const protocol = new PersonaCreationProtocol(repository, blobs, worker);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(protocol.reconcileExpiredReservations()).rejects.toThrow(/transient blob delete failure/i);
      }
      await expect(protocol.reconcileExpiredReservations()).resolves.toBeUndefined();

      expect(blobs.deleteCalls).toBe(11);
      expect(await blobs.get(reservation.photoKeys[0]!)).toBeNull();
      const remaining = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(remaining.rows[0]?.count).toBe("0");
    });
  });

  it("eventually cleans upload-attempt blobs after more than ten transient delete failures", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      class FailTenDeletesBlobStore extends InMemoryBlobStore {
        public deleteCalls = 0;
        override async delete(key: string): Promise<void> {
          this.deleteCalls += 1;
          if (this.deleteCalls <= 10) throw new Error("simulated transient upload cleanup failure");
          await super.delete(key);
        }
      }

      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("attempt-delete-recovery-after-ten-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const attemptId = "00000000-0000-0000-0000-000000000713";
      const claimed = await repository.claimUpload(reservation.id, attemptId);
      const blobs = new FailTenDeletesBlobStore();
      await blobs.put(claimed!.photoKeys[0]!, Buffer.from("moderated-photo"));
      await repository.abort(reservation.id);
      const protocol = new PersonaCreationProtocol(repository, blobs, worker);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(protocol.reconcileExpiredReservations()).rejects.toThrow(/transient upload cleanup failure/i);
      }
      await expect(protocol.reconcileExpiredReservations()).resolves.toBeUndefined();

      expect(blobs.deleteCalls).toBeGreaterThan(10);
      expect(await blobs.get(claimed!.photoKeys[0]!)).toBeNull();
      const remaining = await asUser<{ reservations: string; attempts: string }>(
        fixture.familyA.authUserId,
        `select
          (select count(*) from persona_creation_reservations where id = $1) as reservations,
          (select count(*) from persona_creation_upload_attempts where id = $2) as attempts`,
        [reservation.id, attemptId],
      );
      expect(remaining.rows[0]).toEqual({ reservations: "0", attempts: "0" });
    });
  });

  it("reconciles only expired uploaded reservation blobs and rehydrates a finalized result from PostgreSQL", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const blobs = new InMemoryBlobStore();
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const protocol = new PersonaCreationProtocol(repository, blobs, worker);
      const expired = await repository.prepare({
        kind: "baby",
        displayName: "Expired Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("expired-maya-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      await asSystem(
        `insert into consent_receipts (
          family_id, member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const current = await repository.prepare({
        kind: "baby",
        displayName: "Current June",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("current-june-v1").digest("hex"),
        baby: { displayName: "June" },
      });

      await protocol.uploadModeratedPhotos(expired, [Buffer.from("expired-moderated-photo")]);
      await protocol.uploadModeratedPhotos(current, [Buffer.from("current-moderated-photo")]);
      await asSystem(
        "update persona_creation_reservations set expires_at = now() - interval '1 second' where id = $1",
        [expired.id],
      );

      await protocol.reconcileExpiredReservations();
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${expired.id}/`)).toEqual([]);
      const currentAfterUpload = await repository.readReservation(current.id);
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${current.id}/`))
        .toEqual(currentAfterUpload!.photoKeys);

      const expiredState = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where id = $1",
        [expired.id],
      );
      expect(expiredState.rows[0]?.count).toBe("0");

      const finalized = await repository.finalize(current.id);
      const rehydrated = await new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService)
        .readFinalized(current.id);
      expect(rehydrated).toEqual(finalized);
    });
  });

  it("serializes concurrent finalize and outbox claims across separate service connections", async () => {
    await withIsolatedPostgres(async ({ asService, asServiceConcurrent, asUser, fixture }) => {
      const prepared = await new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService).prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("concurrent-finalize-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const attemptId = "00000000-0000-0000-0000-000000000731";
      const claimed = await asService<{ photo_keys: string[] }>(
        "select * from app_claim_persona_creation_upload($1::uuid, $2::uuid)",
        [prepared.id, attemptId],
      );
      await asService(
        "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
        [prepared.id, attemptId, JSON.stringify([{
          key: claimed.rows[0]!.photo_keys[0],
          sha256: createHash("sha256").update("concurrent-finalize-photo").digest("hex"),
          size: 10,
        }])],
      );

      const finalize = () => asServiceConcurrent<{ outbox_event_id: string }>(
        "select outbox_event_id::text from app_finalize_persona_creation($1::uuid)",
        [prepared.id],
      );
      const [first, second] = await Promise.all([finalize(), finalize()]);
      expect(first.rows[0]?.outbox_event_id).toBe(second.rows[0]?.outbox_event_id);

      const claim = () => asServiceConcurrent<{ id: string }>(
        "select id::text from app_claim_persona_creation_outbox(60)",
      );
      const claims = await Promise.all([claim(), claim()]);
      expect(claims.flatMap((result) => result.rows)).toHaveLength(1);
    });
  });

  it("allows only the upload owner to claim compensation before blob deletion", async () => {
    await withIsolatedPostgres(async ({ asService, asServiceConcurrent, asUser, fixture }) => {
      const prepared = await new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService).prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("compensation-owner-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const ownerAttempt = "00000000-0000-0000-0000-000000000741";
      const otherAttempt = "00000000-0000-0000-0000-000000000742";
      await asService("select * from app_claim_persona_creation_upload($1::uuid, $2::uuid)", [prepared.id, ownerAttempt]);

      const [owner, other] = await Promise.allSettled([
        asServiceConcurrent<{ id: string }>(
          "select id::text from app_claim_persona_creation_compensation($1::uuid, $2::uuid)",
          [prepared.id, ownerAttempt],
        ),
        asServiceConcurrent<{ id: string }>(
          "select id::text from app_claim_persona_creation_compensation($1::uuid, $2::uuid)",
          [prepared.id, otherAttempt],
        ),
      ]);
      const ownerRows = owner.status === "fulfilled" ? owner.value.rows : [];
      const otherRows = other.status === "fulfilled" ? other.value.rows : [];
      expect(ownerRows).toHaveLength(1);
      expect(otherRows).toHaveLength(0);
    });
  });

  it("releases an expired outbox lease with the same stable event identity after a crash before acknowledgement", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("outbox-replay-maya-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const uploadAttemptId = "00000000-0000-0000-0000-000000000703";
      const claimed = await repository.claimUpload(reservation.id, uploadAttemptId);
      await repository.markUploaded(reservation.id, uploadAttemptId, claimed!.photoKeys.map((key) => ({
        key,
        sha256: createHash("sha256").update(key).digest("hex"),
        size: 20_000,
      })));
      const finalized = await repository.finalize(reservation.id);

      const durableQueue = new Map<string, ReturnType<typeof workflowEventFromPayload>>();
      const firstWorkflowAdapter = new FakeWorkflow();
      const lostAcknowledgementWorker = new PostgresPersonaCreationWorkerRepository(asService);
      lostAcknowledgementWorker.markOutboxSent = async () => {
        throw new Error("simulated acknowledgement loss after send");
      };
      const firstDispatcher = new PersonaCreationOutboxDispatcher(
        lostAcknowledgementWorker,
        firstWorkflowAdapter,
      );
      await expect(firstDispatcher.dispatchOne(60)).rejects.toThrow(/acknowledgement loss/i);
      const firstEnvelope = workflowEventFromPayload(firstWorkflowAdapter.enqueuedPayloads[0]!);
      durableQueue.set(String(firstEnvelope.id), firstEnvelope);
      expect(firstEnvelope).toMatchObject({
        id: finalized.outboxEventId,
        name: "lullabook/persona-creation.finalized",
      });

      await asService(
        "update persona_creation_outbox set lease_expires_at = now() - interval '1 second' where id = $1",
        [finalized.outboxEventId],
      );
      const restartedWorkflowAdapter = new FakeWorkflow();
      await runPersonaCreationRecoveryWorker({
        repository: new PostgresPersonaCreationWorkerRepository(asService),
        blobs: new InMemoryBlobStore(),
        workflow: restartedWorkflowAdapter,
        limit: 1,
      });
      const replayEnvelope = workflowEventFromPayload(restartedWorkflowAdapter.enqueuedPayloads[0]!);
      durableQueue.set(String(replayEnvelope.id), replayEnvelope);
      expect(durableQueue.size).toBe(1);

      const downstreamSubmissions: string[] = [];
      const restartedConsumer = new PersonaCreationOutboxConsumer(
        new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService),
        new FakeWorkflow(),
        async (creation) => { downstreamSubmissions.push(creation.outboxEventId); },
      );
      for (const envelope of durableQueue.values()) {
        await restartedConsumer.consume(String(envelope.id));
      }
      expect(downstreamSubmissions).toEqual([finalized.outboxEventId]);

      const outbox = await asUser<{ status: string; attempts: number }>(
        fixture.familyA.authUserId,
        "select status, attempts from persona_creation_outbox where id = $1",
        [finalized.outboxEventId],
      );
      expect(outbox.rows[0]).toEqual({ status: "sent", attempts: 2 });
    });
  });

  it("rehydrates and consumes a finalized outbox event once under at-least-once delivery", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("outbox-consumer-maya-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const uploadAttemptId = "00000000-0000-0000-0000-000000000703";
      const claimed = await repository.claimUpload(reservation.id, uploadAttemptId);
      await repository.markUploaded(reservation.id, uploadAttemptId, claimed!.photoKeys.map((key) => ({
        key,
        sha256: createHash("sha256").update(key).digest("hex"),
        size: 20_000,
      })));
      const finalized = await repository.finalize(reservation.id);
      const event = await worker.claimOutbox();
      expect(event).not.toBeNull();

      const workflow = new FakeWorkflow();
      const consumed: string[] = [];
      const consumer = new PersonaCreationOutboxConsumer(repository, workflow, async (rehydrated) => {
        consumed.push(rehydrated.personaId);
      });
      await consumer.consume(event!.id);
      await consumer.consume(event!.id);

      expect(consumed).toEqual([finalized.personaId]);
      expect(workflow.isStepCompleted(`persona-creation-finalized:${finalized.outboxEventId}`)).toBe(true);
    });
  });

  it("returns a committed finalization after a lost acknowledgement without deleting its blobs", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const blobs = new InMemoryBlobStore();
      const originalFinalize = repository.finalize.bind(repository);
      repository.finalize = async (reservationId) => {
        await originalFinalize(reservationId);
        throw new Error("simulated lost finalization acknowledgement");
      };
      const protocol = new PersonaCreationProtocol(repository, blobs);
      const result = await protocol.createFromModeratedPhotos({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("ambiguous-finalize-v1").digest("hex"),
        baby: { displayName: "Maya" },
      }, [Buffer.from("moderated-photo")]);

      expect(result.state).toBe("finalized");
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${result.id}/`)).toHaveLength(1);
    });
  });

  it("rehydrates an uploaded retry with its compensation identity and cleans on definitive finalize failure", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const blobs = new InMemoryBlobStore();
      const protocol = new PersonaCreationProtocol(repository, blobs);
      const creationInput = {
        kind: "baby" as const,
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("uploaded-retry-compensation-v1").digest("hex"),
        baby: { displayName: "Maya" },
      };
      const reservation = await repository.prepare(creationInput);
      await protocol.uploadModeratedPhotos(reservation, [Buffer.from("moderated-photo")]);
      const uploaded = await repository.readReservation(reservation.id);
      expect(uploaded).toMatchObject({ state: "uploaded", uploadAttemptId: expect.any(String) });

      repository.finalize = async () => {
        throw new Error("definitive finalize refusal");
      };
      await expect(protocol.createFromModeratedPhotos(creationInput, [Buffer.from("moderated-photo")]))
        .rejects.toThrow(/definitive finalize refusal/i);

      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${reservation.id}/`)).toEqual([]);
      const rows = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(rows.rows[0]?.count).toBe("0");
    });
  });

  it("accepts one immutable upload attempt and scheduled cleanup removes only the losing attempt", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const blobs = new InMemoryBlobStore();
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("attempt-winner-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const firstId = "00000000-0000-0000-0000-000000000781";
      const secondId = "00000000-0000-0000-0000-000000000782";
      const first = await repository.claimUpload(reservation.id, firstId);
      await blobs.put(first!.photoKeys[0]!, Buffer.from("losing-attempt"));
      await asSystem(
        "update persona_creation_reservations set upload_lease_expires_at = now() - interval '1 second' where id = $1",
        [reservation.id],
      );
      await asSystem(
        "update persona_creation_upload_attempts set lease_expires_at = now() - interval '1 second' where id = $1",
        [firstId],
      );

      const second = await repository.claimUpload(reservation.id, secondId);
      await blobs.put(second!.photoKeys[0]!, Buffer.from("winning-attempt"));
      await repository.markUploaded(reservation.id, secondId, [{
        key: second!.photoKeys[0]!,
        sha256: createHash("sha256").update("winning-attempt").digest("hex"),
        size: Buffer.byteLength("winning-attempt"),
      }]);
      await expect(repository.markUploaded(reservation.id, firstId, [{
        key: first!.photoKeys[0]!,
        sha256: createHash("sha256").update("losing-attempt").digest("hex"),
        size: Buffer.byteLength("losing-attempt"),
      }])).rejects.toThrow(/not the owner/i);

      await new PersonaCreationProtocol(repository, blobs, worker).reconcileExpiredReservations();
      expect(await blobs.get(first!.photoKeys[0]!)).toBeNull();
      expect(await blobs.get(second!.photoKeys[0]!)).toEqual(Buffer.from("winning-attempt"));
      const accepted = await repository.readReservation(reservation.id);
      expect(accepted).toMatchObject({ state: "uploaded", uploadAttemptId: secondId, photoKeys: second!.photoKeys });
    });
  });

  it("quarantines an invalid cleanup manifest instead of deleting a shared blob", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("shared-key-quarantine-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      await asSystem(
        `update persona_creation_reservations
         set state = 'expired', photo_keys = '["avatars/shared.png"]'::jsonb
         where id = $1`,
        [reservation.id],
      );
      const blobs = new InMemoryBlobStore();
      await blobs.put("avatars/shared.png", Buffer.from("shared"));
      const worker = new PostgresPersonaCreationWorkerRepository(asService);

      expect(await worker.claimExpiredReservations()).toEqual([]);
      expect(await blobs.get("avatars/shared.png")).toEqual(Buffer.from("shared"));
      const quarantine = await asUser<{ cleanup_quarantine_reason: string }>(
        fixture.familyA.authUserId,
        "select cleanup_quarantine_reason from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(quarantine.rows[0]?.cleanup_quarantine_reason).toBe("invalid_photo_key_scope");
    });
  });

  it("rejects reuse of an Adult fingerprint for a Baby or a different Adult identity", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const fingerprint = createHash("sha256").update("adult-identity-fingerprint-v1").digest("hex");
      await repository.prepare({ kind: "adult", displayName: "Parent", photoCount: 1, requestFingerprint: fingerprint });

      await expect(repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: fingerprint,
        baby: { displayName: "Maya" },
      })).rejects.toThrow(/immutable.*identity/i);
      await expect(repository.prepare({
        kind: "adult",
        displayName: "Different Parent",
        photoCount: 1,
        requestFingerprint: fingerprint,
      })).rejects.toThrow(/immutable.*Adult Persona identity/i);
    });
  });

  it("validates retry scalars first and preserves the exact Adult consent mode and receipt ownership", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const fingerprint = createHash("sha256").update("adult-retry-consent-mode-v1").digest("hex");
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const prepared = await repository.prepare({
        kind: "adult",
        displayName: "Parent",
        photoCount: 1,
        requestFingerprint: fingerprint,
      });

      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_prepare_adult_persona_creation(NULL::text, 1, $1)",
        [fingerprint],
      )).rejects.toThrow(/Invalid Adult Persona creation reservation/i);
      await expect(asUser(
        fixture.familyA.authUserId,
        "select * from app_prepare_persona_creation('adult', 'Parent', 1, $1, NULL, NULL, NULL)",
        [fingerprint],
      )).rejects.toThrow(/exact consent mode|immutable Persona creation identity/i);

      await asSystem(
        `update consent_receipts set notice_version = 'different-purpose'
         where id = (select adult_consent_receipt_id from persona_creation_reservations where id = $1)`,
        [prepared.id],
      );
      await expect(repository.prepare({
        kind: "adult",
        displayName: "Parent",
        photoCount: 1,
        requestFingerprint: fingerprint,
      })).rejects.toThrow(/self-consent ownership|immutable Adult Persona identity/i);
    });
  });

  it("requires every Adult receipt identity and purpose predicate", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const otherMemberId = "00000000-0000-0000-0000-000000000219";
      const otherAuthId = "00000000-0000-0000-0000-000000000119";
      await asSystem("insert into auth.users (id) values ($1)", [otherAuthId]);
      await asSystem(
        `insert into members (id, auth_user_id, family_id, email, role, jurisdiction)
         values ($1, $2, $3, 'subject@example.test', 'member', 'US')`,
        [otherMemberId, otherAuthId, fixture.familyA.familyId],
      );
      const wrongSubject = await asService<{ id: string }>(
        `insert into consent_receipts (
          family_id, member_id, subject_member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $3, 'US', 'adult-v1', 'signed_form', 'verified') returning id`,
        [fixture.familyA.familyId, fixture.familyA.memberId, otherMemberId],
      );
      const wrongPurpose = await asService<{ id: string }>(
        `insert into consent_receipts (
          family_id, member_id, subject_member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $2, 'US', 'adult-v1', 'email_plus', 'verified') returning id`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);

      for (const [receiptId, suffix] of [
        [wrongSubject.rows[0]!.id, "subject"],
        [wrongPurpose.rows[0]!.id, "purpose"],
      ] as const) {
        await expect(repository.prepare({
          kind: "adult",
          displayName: "Parent",
          photoCount: 1,
          requestFingerprint: createHash("sha256").update(`adult-${suffix}-v1`).digest("hex"),
          adultConsentReceiptId: receiptId,
        })).rejects.toThrow(/subject-linked Adult consent/i);
      }
    });
  });

  it("serializes consent revocation ahead of finalization and fails closed", async () => {
    await withIsolatedPostgres(async ({ asService, asServiceConcurrent, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("consent-revocation-race-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const attemptId = "00000000-0000-0000-0000-000000000761";
      const claimed = await repository.claimUpload(reservation.id, attemptId);
      await repository.markUploaded(reservation.id, attemptId, [{
        key: claimed!.photoKeys[0]!,
        sha256: createHash("sha256").update("photo").digest("hex"),
        size: 5,
      }]);
      await asSystem(`
        create or replace function test_delay_consent_revoke() returns trigger
        language plpgsql as $$ begin perform pg_sleep(0.2); return new; end $$;
        create trigger test_delay_consent_revoke before update of status on consent_receipts
        for each row when (new.status = 'revoked') execute function test_delay_consent_revoke();
      `);

      const revoke = asServiceConcurrent(
        "update consent_receipts set status = 'revoked' where id = $1",
        [fixture.familyA.consentReceiptId],
      );
      await asSystem("select pg_sleep(0.05)");
      const finalize = asServiceConcurrent(
        "select * from app_finalize_persona_creation($1::uuid)",
        [reservation.id],
      );
      const [revoked, finalized] = await Promise.allSettled([revoke, finalize]);
      expect(revoked.status).toBe("fulfilled");
      expect(finalized.status).toBe("rejected");
      if (finalized.status === "rejected") {
        expect(String(finalized.reason)).toMatch(/exact reserved canonical Baby consent/i);
      }
    });
  });

  it("bounds ordered outbox quarantine work instead of updating the whole table", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservations = [];
      for (const [index, label] of ["Maya", "June"].entries()) {
        if (index === 1) {
          await asSystem(
            `insert into consent_receipts (family_id, member_id, jurisdiction, notice_version, method, status)
             values ($1, $2, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
            [fixture.familyA.familyId, fixture.familyA.memberId],
          );
        }
        reservations.push(await repository.prepare({
          kind: "baby",
          displayName: label,
          photoCount: 1,
          requestFingerprint: createHash("sha256").update(`bounded-outbox-${label}`).digest("hex"),
          baby: { displayName: label },
        }));
      }
      for (const [index, reservation] of reservations.entries()) {
        const outboxId = `00000000-0000-0000-0000-00000000079${index + 1}`;
        await asSystem(
          `insert into persona_creation_outbox (id, family_id, reservation_id, event_type, payload, created_at)
           values ($1, $2, $3, 'persona-creation-finalized', '{}'::jsonb, now() + ($4 * interval '1 second'))`,
          [outboxId, fixture.familyA.familyId, reservation.id, index],
        );
      }

      const quarantined = await asService<{ count: number }>(
        "select app_quarantine_invalid_persona_creation_outbox(1) as count",
      );
      expect(quarantined.rows[0]?.count).toBe(1);
      const statuses = await asUser<{ status: string; count: string }>(
        fixture.familyA.authUserId,
        "select status, count(*)::text as count from persona_creation_outbox group by status order by status",
      );
      expect(statuses.rows).toEqual([
        { status: "failed", count: "1" },
        { status: "queued", count: "1" },
      ]);
    });
  });

  it("bounds ordered reservation quarantine work with SKIP LOCKED", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservations = [];
      for (const [index, label] of ["Maya", "June"].entries()) {
        if (index === 1) {
          await asSystem(
            `insert into consent_receipts (family_id, member_id, jurisdiction, notice_version, method, status)
             values ($1, $2, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
            [fixture.familyA.familyId, fixture.familyA.memberId],
          );
        }
        reservations.push(await repository.prepare({
          kind: "baby",
          displayName: label,
          photoCount: 1,
          requestFingerprint: createHash("sha256").update(`bounded-cleanup-quarantine-${label}`).digest("hex"),
          baby: { displayName: label },
        }));
      }
      await asSystem(
        `update persona_creation_reservations
         set state = 'aborted', photo_keys = '["shared/not-owned.jpg"]'::jsonb
         where id = any($1::uuid[])`,
        [reservations.map((reservation) => reservation.id)],
      );

      expect(await new PostgresPersonaCreationWorkerRepository(asService).claimExpiredReservations(1, 60)).toEqual([]);
      const quarantined = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where cleanup_quarantined_at is not null",
      );
      expect(quarantined.rows[0]?.count).toBe("1");
    });
  });

  it("rejects null outbox leases, constrains leased rows, and quarantines non-finalized candidates", async () => {
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      await expect(asService("select * from app_claim_persona_creation_outbox(NULL::integer)"))
        .rejects.toThrow(/lease must be between/i);

      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("invalid-outbox-candidate-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      const invalidOutboxId = "00000000-0000-0000-0000-000000000771";
      await asSystem(
        `insert into persona_creation_outbox (id, family_id, reservation_id, event_type, payload)
         values ($1, $2, $3, 'persona-creation-finalized', jsonb_build_object(
           'eventId', $1::uuid, 'familyId', $2::uuid, 'reservationId', $3::uuid,
           'personaId', (select persona_id from persona_creation_reservations where id = $3)
         ))`,
        [invalidOutboxId, fixture.familyA.familyId, reservation.id],
      );
      expect(await new PostgresPersonaCreationWorkerRepository(asService).claimOutbox()).toBeNull();
      const invalid = await asUser<{ status: string }>(
        fixture.familyA.authUserId,
        "select status from persona_creation_outbox where id = $1",
        [invalidOutboxId],
      );
      expect(invalid.rows[0]?.status).toBe("failed");
      await expect(asSystem(
        "update persona_creation_outbox set status = 'leased', lease_expires_at = NULL where id = $1",
        [invalidOutboxId],
      )).rejects.toThrow(/persona_creation_outbox_lease_check/i);
    });
  });

  it("uses bounded cleanup claims with SKIP LOCKED leases, tokens, and retryable recovery", async () => {
    await withIsolatedPostgres(async ({ asService, asServiceConcurrent, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const reservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("bounded-cleanup-v1").digest("hex"),
        baby: { displayName: "Maya" },
      });
      await repository.abort(reservation.id);
      const claims = await Promise.all([
        asServiceConcurrent<{ id: string; cleanup_lease_token: string }>(
          "select id::text, cleanup_lease_token::text from app_claim_expired_persona_creation_reservations(1, 60)",
        ),
        asServiceConcurrent<{ id: string; cleanup_lease_token: string }>(
          "select id::text, cleanup_lease_token::text from app_claim_expired_persona_creation_reservations(1, 60)",
        ),
      ]);
      const leased = claims.flatMap((claim) => claim.rows);
      expect(leased).toHaveLength(1);
      await expect(asService(
        "select app_complete_persona_creation_expired_cleanup($1::uuid, $2::uuid)",
        [reservation.id, "00000000-0000-0000-0000-000000000799"],
      )).rejects.toThrow(/cleanup lease not found/i);

      await asSystem(
        `update persona_creation_reservations
         set cleanup_lease_token = NULL, cleanup_lease_expires_at = NULL, cleanup_attempts = 10
         where id = $1`,
        [reservation.id],
      );
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const retried = await worker.claimExpiredReservations(1, 60);
      expect(retried).toHaveLength(1);
      expect(retried[0]).toMatchObject({ id: reservation.id, cleanupToken: expect.any(String) });
      await worker.markExpiredCleanupComplete(retried[0]!.id, retried[0]!.cleanupToken);
      const remaining = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*) from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(remaining.rows[0]?.count).toBe("0");
    });
  });

  it("upgrades 016 rows without guessing Adult receipt ownership and backfills one exact Baby receipt", async () => {
    let adultReservationId = "";
    let adultReceiptId = "";
    let babyReservationId = "";
    await withPersonaProtocolUpgradeFrom016(
      async ({ asSystem, asUser, fixture }) => {
        const adult = await asUser<{ id: string }>(
          fixture.familyA.authUserId,
          "select id::text from app_prepare_adult_persona_creation('Parent', 1, $1)",
          [createHash("sha256").update("upgrade-adult-v1").digest("hex")],
        );
        adultReservationId = adult.rows[0]!.id;
        const adultRow = await asSystem<{ adult_consent_receipt_id: string }>(
          "select adult_consent_receipt_id::text from persona_creation_reservations where id = $1",
          [adultReservationId],
        );
        adultReceiptId = adultRow.rows[0]!.adult_consent_receipt_id;
        const baby = await asUser<{ id: string }>(
          fixture.familyA.authUserId,
          "select id::text from app_prepare_persona_creation('baby', 'Maya', 1, $1, $2::jsonb)",
          [createHash("sha256").update("upgrade-baby-v1").digest("hex"), JSON.stringify({ displayName: "Maya" })],
        );
        babyReservationId = baby.rows[0]!.id;
      },
      async ({ asService, asUser, fixture }) => {
        const upgraded = await asUser<{
          owns_adult_consent_receipt: boolean;
          baby_consent_receipt_id: string;
        }>(
          fixture.familyA.authUserId,
          `select
            (select owns_adult_consent_receipt from persona_creation_reservations where id = $1) as owns_adult_consent_receipt,
            (select baby_consent_receipt_id::text from persona_creation_reservations where id = $2) as baby_consent_receipt_id`,
          [adultReservationId, babyReservationId],
        );
        expect(upgraded.rows[0]).toEqual({
          owns_adult_consent_receipt: false,
          baby_consent_receipt_id: fixture.familyA.consentReceiptId,
        });

        await asUser(fixture.familyA.authUserId, "select * from app_abort_persona_creation($1::uuid)", [adultReservationId]);
        const claim = await asService<{ cleanup_lease_token: string }>(
          "select cleanup_lease_token::text from app_claim_expired_persona_creation_reservations(1, 60) where id = $1",
          [adultReservationId],
        );
        await asService(
          "select app_complete_persona_creation_expired_cleanup($1::uuid, $2::uuid)",
          [adultReservationId, claim.rows[0]!.cleanup_lease_token],
        );
        const receipt = await asUser<{ count: string }>(
          fixture.familyA.authUserId,
          "select count(*) from consent_receipts where id = $1",
          [adultReceiptId],
        );
        expect(receipt.rows[0]?.count).toBe("1");
      },
    );
  });

  it("remediates Adult Personas finalized by ordinary Members under 016 without touching Guardian creations", async () => {
    const ordinaryAuthUserId = "00000000-0000-0000-0000-000000000181";
    const ordinaryMemberId = "00000000-0000-0000-0000-000000000281";
    let unsafeReservationId = "";
    let unsafePersonaId = "";
    let unsafeOutboxId = "";
    let guardianReservationId = "";
    let guardianPersonaId = "";
    let guardianOutboxId = "";

    await withPersonaProtocolUpgradeFrom016(
      async ({ asSystem, asUser, fixture }) => {
        await asSystem("insert into auth.users (id) values ($1)", [ordinaryAuthUserId]);
        await asSystem(
          `insert into members (id, auth_user_id, family_id, email, role, jurisdiction)
           values ($1, $2, $3, 'ordinary-member@example.test', 'member', 'US')`,
          [ordinaryMemberId, ordinaryAuthUserId, fixture.familyA.familyId],
        );

        const finalizeAdult = async (authUserId: string, label: string) => {
          const prepared = await asUser<{ id: string; photo_keys: string[] }>(
            authUserId,
            "select id::text, photo_keys from app_prepare_adult_persona_creation($1, 1, $2)",
            [label, createHash("sha256").update(`upgrade-finalized-${label}`).digest("hex")],
          );
          const reservationId = prepared.rows[0]!.id;
          await asUser(
            authUserId,
            "select * from app_mark_persona_creation_uploaded($1::uuid, $2::jsonb)",
            [reservationId, JSON.stringify([{
              key: prepared.rows[0]!.photo_keys[0],
              sha256: createHash("sha256").update(label).digest("hex"),
              size: 10,
            }])],
          );
          const finalized = await asUser<{ outbox_event_id: string }>(
            authUserId,
            "select outbox_event_id::text from app_finalize_persona_creation($1::uuid)",
            [reservationId],
          );
          const reservation = await asSystem<{ persona_id: string }>(
            "select persona_id::text from persona_creation_reservations where id = $1",
            [reservationId],
          );
          return {
            reservationId,
            personaId: reservation.rows[0]!.persona_id,
            outboxId: finalized.rows[0]!.outbox_event_id,
          };
        };

        const unsafe = await finalizeAdult(ordinaryAuthUserId, "Ordinary Member");
        unsafeReservationId = unsafe.reservationId;
        unsafePersonaId = unsafe.personaId;
        unsafeOutboxId = unsafe.outboxId;
        const guardian = await finalizeAdult(fixture.familyA.authUserId, "Guardian");
        guardianReservationId = guardian.reservationId;
        guardianPersonaId = guardian.personaId;
        guardianOutboxId = guardian.outboxId;
      },
      async ({ asService, asSystem }) => {
        const upgraded = await asSystem<{
          unsafe_state: string;
          unsafe_persona_status: string;
          unsafe_outbox_status: string;
          guardian_state: string;
          guardian_persona_status: string;
          guardian_outbox_status: string;
        }>(
          `select
            (select state from persona_creation_reservations where id = $1) as unsafe_state,
            (select status from personas where id = $2) as unsafe_persona_status,
            (select status from persona_creation_outbox where id = $3) as unsafe_outbox_status,
            (select state from persona_creation_reservations where id = $4) as guardian_state,
            (select status from personas where id = $5) as guardian_persona_status,
            (select status from persona_creation_outbox where id = $6) as guardian_outbox_status`,
          [
            unsafeReservationId,
            unsafePersonaId,
            unsafeOutboxId,
            guardianReservationId,
            guardianPersonaId,
            guardianOutboxId,
          ],
        );
        expect(upgraded.rows[0]).toEqual({
          unsafe_state: "aborted",
          unsafe_persona_status: "failed",
          unsafe_outbox_status: "failed",
          guardian_state: "finalized",
          guardian_persona_status: "training",
          guardian_outbox_status: "queued",
        });

        const unsafeDispatch = await asService(
          "select * from app_claim_persona_creation_outbox_for_reservation($1::uuid, 60)",
          [unsafeReservationId],
        );
        expect(unsafeDispatch.rows).toEqual([]);
        const guardianDispatch = await asService<{ id: string }>(
          "select id::text from app_claim_persona_creation_outbox_for_reservation($1::uuid, 60)",
          [guardianReservationId],
        );
        expect(guardianDispatch.rows).toEqual([{ id: guardianOutboxId }]);

        const cleanup = await asService<{ cleanup_lease_token: string }>(
          `select cleanup_lease_token::text
           from app_claim_expired_persona_creation_reservations(10, 60)
           where id = $1`,
          [unsafeReservationId],
        );
        expect(cleanup.rows).toHaveLength(1);
        await asService(
          "select app_complete_persona_creation_expired_cleanup($1::uuid, $2::uuid)",
          [unsafeReservationId, cleanup.rows[0]!.cleanup_lease_token],
        );
        const remaining = await asSystem<{ unsafe_rows: string; guardian_rows: string }>(
          `select
            (select count(*) from persona_creation_reservations where id = $1)
              + (select count(*) from personas where id = $2)
              + (select count(*) from persona_creation_outbox where id = $3) as unsafe_rows,
            (select count(*) from persona_creation_reservations where id = $4)
              + (select count(*) from personas where id = $5)
              + (select count(*) from persona_creation_outbox where id = $6) as guardian_rows`,
          [
            unsafeReservationId,
            unsafePersonaId,
            unsafeOutboxId,
            guardianReservationId,
            guardianPersonaId,
            guardianOutboxId,
          ],
        );
        expect(remaining.rows[0]).toEqual({ unsafe_rows: "0", guardian_rows: "3" });
      },
    );
  });

  it("backfills finalized 016 Baby consent and durably blocks dispatch after exact receipt revocation", async () => {
    let validReservationId = "";
    let validOutboxId = "";
    let revokedReservationId = "";
    let revokedOutboxId = "";
    let revokedPersonaId = "";
    let revokedBabyId = "";

    await withPersonaProtocolUpgradeFrom016(
      async ({ asSystem, asUser, fixture }) => {
        const finalizeBaby = async (authUserId: string, label: string) => {
          const prepared = await asUser<{ id: string; photo_keys: string[] }>(
            authUserId,
            "select id::text, photo_keys from app_prepare_persona_creation('baby', $1, 1, $2, $3::jsonb)",
            [
              label,
              createHash("sha256").update(`upgrade-finalized-baby-${label}`).digest("hex"),
              JSON.stringify({ displayName: label }),
            ],
          );
          const reservationId = prepared.rows[0]!.id;
          await asUser(
            authUserId,
            "select * from app_mark_persona_creation_uploaded($1::uuid, $2::jsonb)",
            [reservationId, JSON.stringify([{
              key: prepared.rows[0]!.photo_keys[0],
              sha256: createHash("sha256").update(label).digest("hex"),
              size: 10,
            }])],
          );
          const finalized = await asUser<{ outbox_event_id: string }>(
            authUserId,
            "select outbox_event_id::text from app_finalize_persona_creation($1::uuid)",
            [reservationId],
          );
          const graph = await asSystem<{ persona_id: string; baby_id: string }>(
            "select persona_id::text, baby_id::text from persona_creation_reservations where id = $1",
            [reservationId],
          );
          return {
            reservationId,
            outboxId: finalized.rows[0]!.outbox_event_id,
            personaId: graph.rows[0]!.persona_id,
            babyId: graph.rows[0]!.baby_id,
          };
        };

        const valid = await finalizeBaby(fixture.familyA.authUserId, "Valid Legacy Baby");
        validReservationId = valid.reservationId;
        validOutboxId = valid.outboxId;
        const revoked = await finalizeBaby(fixture.familyB.authUserId, "Revoked Legacy Baby");
        revokedReservationId = revoked.reservationId;
        revokedOutboxId = revoked.outboxId;
        revokedPersonaId = revoked.personaId;
        revokedBabyId = revoked.babyId;
      },
      async ({ asService, asSystem, fixture }) => {
        const upgraded = await asSystem<{
          valid_receipt_id: string;
          revoked_receipt_id: string;
        }>(
          `select
            (select baby_consent_receipt_id::text from persona_creation_reservations where id = $1) as valid_receipt_id,
            (select baby_consent_receipt_id::text from persona_creation_reservations where id = $2) as revoked_receipt_id`,
          [validReservationId, revokedReservationId],
        );
        expect(upgraded.rows[0]).toEqual({
          valid_receipt_id: fixture.familyA.consentReceiptId,
          revoked_receipt_id: fixture.familyB.consentReceiptId,
        });

        const validClaim = await asService<{ id: string }>(
          "select id::text from app_claim_persona_creation_outbox_for_reservation($1::uuid, 60)",
          [validReservationId],
        );
        expect(validClaim.rows).toEqual([{ id: validOutboxId }]);

        await asService(
          "update consent_receipts set status = 'revoked' where id = $1",
          [fixture.familyB.consentReceiptId],
        );
        const revokedClaim = await asService(
          "select * from app_claim_persona_creation_outbox_for_reservation($1::uuid, 60)",
          [revokedReservationId],
        );
        expect(revokedClaim.rows).toEqual([]);

        const blocked = await asSystem<{
          reservation_state: string;
          remediation_reason: string;
          persona_status: string;
          outbox_status: string;
        }>(
          `select
            (select state from persona_creation_reservations where id = $1) as reservation_state,
            (select remediation_reason from persona_creation_reservations where id = $1) as remediation_reason,
            (select status from personas where id = $2) as persona_status,
            (select status from persona_creation_outbox where id = $3) as outbox_status`,
          [revokedReservationId, revokedPersonaId, revokedOutboxId],
        );
        expect(blocked.rows[0]).toEqual({
          reservation_state: "aborted",
          remediation_reason: "baby_consent_invalid_before_dispatch",
          persona_status: "failed",
          outbox_status: "failed",
        });

        const cleanup = await asService<{ cleanup_lease_token: string }>(
          `select cleanup_lease_token::text
           from app_claim_expired_persona_creation_reservations(10, 60)
           where id = $1`,
          [revokedReservationId],
        );
        expect(cleanup.rows).toHaveLength(1);
        await asService(
          "select app_complete_persona_creation_expired_cleanup($1::uuid, $2::uuid)",
          [revokedReservationId, cleanup.rows[0]!.cleanup_lease_token],
        );
        const remaining = await asSystem<{ count: string }>(
          `select
            (select count(*) from persona_creation_reservations where id = $1)
            + (select count(*) from persona_creation_outbox where id = $2)
            + (select count(*) from personas where id = $3)
            + (select count(*) from babies where id = $4) as count`,
          [revokedReservationId, revokedOutboxId, revokedPersonaId, revokedBabyId],
        );
        expect(remaining.rows[0]?.count).toBe("0");
      },
    );
  });

  it("upgrades ambiguous 016 Baby reservations without assigning one receipt twice", async () => {
    const reservationIds: string[] = [];
    await withPersonaProtocolUpgradeFrom016(
      async ({ asSystem, asUser, fixture }) => {
        for (const label of ["Maya", "June"]) {
          const reservation = await asUser<{ id: string }>(
            fixture.familyA.authUserId,
            "select id::text from app_prepare_persona_creation('baby', $1, 1, $2, $3::jsonb)",
            [
              label,
              createHash("sha256").update(`upgrade-ambiguous-${label}`).digest("hex"),
              JSON.stringify({ displayName: label }),
            ],
          );
          reservationIds.push(reservation.rows[0]!.id);
        }
        const receiptCount = await asSystem<{ count: string }>(
          "select count(*) from consent_receipts where family_id = $1 and method = 'payment_vpc'",
          [fixture.familyA.familyId],
        );
        expect(receiptCount.rows[0]?.count).toBe("1");
      },
      async ({ asService, asUser, fixture }) => {
        const upgraded = await asUser<{ id: string; state: string; baby_consent_receipt_id: string | null }>(
          fixture.familyA.authUserId,
          `select id::text, state, baby_consent_receipt_id::text
           from persona_creation_reservations
           where id = any($1::uuid[])
           order by id`,
          [reservationIds],
        );
        expect(upgraded.rows).toHaveLength(2);
        expect(upgraded.rows.every((row) => row.state === "aborted" && row.baby_consent_receipt_id === null)).toBe(true);

        const claims = await asService<{ id: string }>(
          "select id::text from app_claim_expired_persona_creation_reservations(10, 60)",
        );
        expect(claims.rows.map((row) => row.id).sort()).toEqual([...reservationIds].sort());
      },
    );
  });
});
