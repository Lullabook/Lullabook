import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PostgresPersonaCreationRepository, PersonaCreationProtocol } from "@/db/persona-creation-protocol";
import { InMemoryBlobStore } from "@/adapters/fakes";
import { withIsolatedPostgres } from "@/../tests/support/postgres/rls-harness";

describe("178 — PostgreSQL Persona creation protocol", () => {
  it("reserves immutable Family-owned IDs and keys without creating domain rows or an outbox event", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId);
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
  });

  it("finalizes the reserved graph and exactly one byte-free outbox event after every manifest is recorded", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId);
      const prepared = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 3,
        requestFingerprint: createHash("sha256").update("finalize-maya-v1").digest("hex"),
        baby: { displayName: "Maya" },
        bond: { relationship: "daughter", babyCallsThem: "Mama", theyCallBaby: "Moonbeam" },
      });

      await repository.markUploaded(
        prepared.id,
        prepared.photoKeys.map((key, index) => ({
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
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      const receipt = await asUser<{ id: string }>(
        fixture.familyA.authUserId,
        `insert into consent_receipts (
          family_id, member_id, subject_member_id, jurisdiction, notice_version, method, status
        ) values ($1, $2, $2, 'US', 'adult-self-consent-v1', 'signed_form', 'verified') returning id`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId);
      const prepared = await repository.prepare({
        kind: "adult",
        displayName: "Parent",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("adult-parent-v1").digest("hex"),
        adultConsentReceiptId: receipt.rows[0]!.id,
        baby: { displayName: "Maya" },
        bond: { relationship: "parent", babyCallsThem: "Mama", theyCallBaby: "Moonbeam" },
      });
      await repository.markUploaded(prepared.id, prepared.photoKeys.map((key) => ({
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

  it("compensates every creation-scoped blob and aborts the reservation when an upload fails", async () => {
    await withIsolatedPostgres(async ({ asUser, fixture }) => {
      class FailSecondWriteBlobStore extends InMemoryBlobStore {
        private writes = 0;
        override async put(key: string, bytes: Buffer): Promise<void> {
          this.writes += 1;
          if (this.writes === 2) throw new Error("simulated blob write failure");
          await super.put(key, bytes);
        }
      }

      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId);
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

      const state = await asUser<{ state: string }>(
        fixture.familyA.authUserId,
        "select state from persona_creation_reservations where id = $1",
        [reservation.id],
      );
      expect(state.rows[0]?.state).toBe("aborted");
    });
  });
});
