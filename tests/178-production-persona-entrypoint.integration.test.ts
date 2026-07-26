import { describe, expect, it } from "vitest";
import { FakeWorkflow, InMemoryBlobStore, FakeLiveness, FakeModeration } from "@/adapters/fakes";
import { DataStore } from "@/db/store";
import { goodPhoto } from "@/test/fixtures";
import {
  PersonaCreationProtocol,
  PostgresPersonaCreationRepository,
  PostgresPersonaCreationWorkerRepository,
  type FinalizedPersonaCreation,
  type PersonaCreationPhotoManifest,
  type PersonaCreationRepository,
  type PersonaCreationReservation,
  type PersonaCreationReservationInput,
} from "@/db/persona-creation-protocol";
import { ChildSafetyService } from "@/services/child-safety";
import {
  ProductionPersonaCreationService,
  personaCreationRequestFingerprint,
} from "@/services/production-persona-creation";
import { runPersonaCreationActionBoundary } from "@/lib/actions";
import { withIsolatedPostgres } from "@/../tests/support/postgres/rls-harness";
import {
  personaCreationRecovery,
  runPersonaCreationRecoveryWorker,
  workflowFunctions,
} from "@/workflows/functions";

class RecordingRepository implements PersonaCreationRepository {
  prepared = 0;
  uploaded: PersonaCreationPhotoManifest[] = [];
  finalized = 0;
  aborted = 0;
  failFinalize = false;
  reservation: PersonaCreationReservation = {
    id: "reservation-1",
    familyId: "family-1",
    state: "prepared",
    photoKeys: [
      "persona-creation/family-1/reservation-1/photos/0.jpg",
      "persona-creation/family-1/reservation-1/photos/1.jpg",
      "persona-creation/family-1/reservation-1/photos/2.jpg",
    ],
  };

  async prepare(_input: PersonaCreationReservationInput) {
    this.prepared++;
    return this.reservation;
  }
  async claimUpload(_id: string, _attemptId: string) {
    return this.reservation;
  }
  async markUploaded(_id: string, _attemptId: string, manifest: PersonaCreationPhotoManifest[]) {
    this.uploaded = manifest;
    this.reservation = { ...this.reservation, state: "uploaded" };
    return { id: this.reservation.id, state: "uploaded" as const };
  }
  async claimCompensation() {
    if (this.reservation.state === "finalized") return null;
    this.reservation = { ...this.reservation, state: "aborted" };
    return {
      id: this.reservation.id,
      familyId: this.reservation.familyId,
      photoKeys: this.reservation.photoKeys,
      cleanupToken: "cleanup-1",
    };
  }
  async completeCleanup() { this.aborted++; }
  async releaseCleanup() {}
  async abort() { this.aborted++; }
  async readReservation() { return this.reservation; }
  async readFinalized() {
    if (this.reservation.state !== "finalized") throw new Error("not finalized");
    return this.finalizedResult();
  }
  async readFinalizedByEventId() { return this.readFinalized(); }
  async finalize(): Promise<FinalizedPersonaCreation> {
    this.finalized++;
    if (this.failFinalize) throw new Error("injected finalize crash");
    this.reservation = { ...this.reservation, state: "finalized" };
    return this.finalizedResult();
  }
  private finalizedResult(): FinalizedPersonaCreation {
    return {
      id: this.reservation.id,
      familyId: this.reservation.familyId,
      personaId: "persona-1",
      state: "finalized",
      outboxEventId: "event-1",
      photoKeys: this.reservation.photoKeys,
    };
  }
}

function input(photo: Buffer) {
  const photos = [photo, goodPhoto(0xab), goodPhoto(0xac)];
  const base = {
    kind: "baby" as const,
    displayName: "Maya",
    photoCount: photos.length,
    photos,
    baby: { displayName: "Maya" },
  };
  return { ...base, requestFingerprint: personaCreationRequestFingerprint(base) };
}

describe("178 — production Persona creation entrypoint", () => {
  it("moderates bytes before reservation or blob persistence, then returns only after finalize/outbox", async () => {
    const store = new DataStore();
    const moderation = new FakeModeration();
    const blobs = new InMemoryBlobStore();
    const repository = new RecordingRepository();
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, moderation),
      new FakeLiveness(),
      new PersonaCreationProtocol(repository, blobs),
    );

    const result = await service.create(input(goodPhoto()));

    expect(moderation.audit).toHaveLength(3);
    expect(repository.prepared).toBe(1);
    expect(repository.uploaded).toHaveLength(3);
    expect(repository.finalized).toBe(1);
    expect(result).toMatchObject({ personaId: "persona-1", outboxEventId: "event-1" });
    expect(await blobs.list("persona-creation/")).toEqual(repository.reservation.photoKeys);
  });

  it("leaves no reservation or blob when moderation rejects the source photo", async () => {
    const store = new DataStore();
    const moderation = new FakeModeration();
    const blocked = goodPhoto();
    blocked.write("blocked", 10);
    moderation.blockedImageContents.push("blocked");
    const blobs = new InMemoryBlobStore();
    const repository = new RecordingRepository();
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, moderation),
      new FakeLiveness(),
      new PersonaCreationProtocol(repository, blobs),
    );

    await expect(service.create(input(blocked))).rejects.toThrow(/unsafe/i);
    expect(repository.prepared).toBe(0);
    expect(await blobs.list("persona-creation/")).toEqual([]);
  });

  it("rejects more than 20 photos before preflight, moderation, or reservation", async () => {
    const store = new DataStore();
    const moderation = new FakeModeration();
    const repository = new RecordingRepository();
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, moderation),
      new FakeLiveness(),
      new PersonaCreationProtocol(repository, new InMemoryBlobStore()),
    );
    const photos = Array.from({ length: 21 }, (_, index) => goodPhoto(0x20 + index));
    const base = {
      kind: "baby" as const,
      displayName: "Maya",
      photoCount: photos.length,
      photos,
      baby: { displayName: "Maya" },
    };

    await expect(service.create({
      ...base,
      requestFingerprint: personaCreationRequestFingerprint(base),
    })).rejects.toThrow(/Photo count must be between 1 and 20/i);
    expect(moderation.audit).toHaveLength(0);
    expect(repository.prepared).toBe(0);
  });

  it("crosses the action composition, authenticated RPC, service-role finalize, and durable outbox", async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(
        asUser,
        fixture.familyA.authUserId,
        asService,
      );
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const blobs = new InMemoryBlobStore();
      const workflow = new FakeWorkflow();
      const creationInput = input(goodPhoto());

      const finalized = await runPersonaCreationActionBoundary({
        creation: creationInput,
        repository,
        worker,
        blobs,
        childSafety: new ChildSafetyService(new DataStore(), new FakeModeration()),
        liveness: new FakeLiveness(),
        workflow,
      });

      expect(finalized.familyId).toBe(fixture.familyA.familyId);
      expect(workflow.enqueuedPayloads).toEqual([
        expect.objectContaining({ eventId: finalized.outboxEventId, reservationId: finalized.id }),
      ]);
      const rows = await asUser<{ persona_count: string; outbox_status: string }>(
        fixture.familyA.authUserId,
        `select
          (select count(*) from personas where id = $1) as persona_count,
          (select status from persona_creation_outbox where id = $2) as outbox_status`,
        [finalized.personaId, finalized.outboxEventId],
      );
      expect(rows.rows[0]).toEqual({ persona_count: "1", outbox_status: "sent" });
    });
  });

  it("registers and runs the bounded service-role recovery worker for cleanup and outbox dispatch", async () => {
    expect(workflowFunctions).toContain(personaCreationRecovery);
    await withIsolatedPostgres(async ({ asService, asSystem, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const blobs = new InMemoryBlobStore();
      const workflow = new FakeWorkflow();
      const protocol = new PersonaCreationProtocol(repository, blobs, worker);

      const finalizedReservation = await repository.prepare({
        kind: "baby",
        displayName: "Maya",
        photoCount: 1,
        requestFingerprint: personaCreationRequestFingerprint({
          kind: "baby",
          displayName: "Maya",
          photoCount: 1,
          photos: [goodPhoto()],
          baby: { displayName: "Maya" },
        }),
        baby: { displayName: "Maya" },
      });
      await protocol.uploadModeratedPhotos(finalizedReservation, [goodPhoto()]);
      const finalized = await repository.finalize(finalizedReservation.id);

      await asSystem(
        `insert into consent_receipts (family_id, member_id, jurisdiction, notice_version, method, status)
         values ($1, $2, 'US', 'us-coppa-v1', 'payment_vpc', 'verified')`,
        [fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const expired = await repository.prepare({
        kind: "baby",
        displayName: "June",
        photoCount: 1,
        requestFingerprint: personaCreationRequestFingerprint({
          kind: "baby",
          displayName: "June",
          photoCount: 1,
          photos: [goodPhoto(0xbb)],
          baby: { displayName: "June" },
        }),
        baby: { displayName: "June" },
      });
      await protocol.uploadModeratedPhotos(expired, [goodPhoto(0xbb)]);
      await asSystem(
        "update persona_creation_reservations set expires_at = now() - interval '1 second' where id = $1",
        [expired.id],
      );

      const result = await runPersonaCreationRecoveryWorker({ repository: worker, blobs, workflow, limit: 5 });
      expect(result.dispatched).toBe(1);
      expect(result.cleaned).toBeGreaterThanOrEqual(1);
      expect(workflow.enqueuedPayloads).toEqual([
        expect.objectContaining({ eventId: finalized.outboxEventId, reservationId: finalized.id }),
      ]);
      expect(await blobs.list(`persona-creation/${fixture.familyA.familyId}/${expired.id}/`)).toEqual([]);
    });
  });

  it("compensates creation-scoped blobs when finalize crashes", async () => {
    const store = new DataStore();
    const blobs = new InMemoryBlobStore();
    const repository = new RecordingRepository();
    repository.failFinalize = true;
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, new FakeModeration()),
      new FakeLiveness(),
      new PersonaCreationProtocol(repository, blobs),
    );

    await expect(service.create(input(goodPhoto()))).rejects.toThrow(/finalize crash/);
    expect(repository.aborted).toBe(1);
    expect(await blobs.list("persona-creation/")).toEqual([]);
  });
});
