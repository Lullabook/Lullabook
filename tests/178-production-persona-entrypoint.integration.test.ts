import { describe, expect, it } from "vitest";
import { InMemoryBlobStore, FakeLiveness, FakeModeration } from "@/adapters/fakes";
import { DataStore } from "@/db/store";
import { goodPhoto } from "@/test/fixtures";
import {
  PersonaCreationProtocol,
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
  async markUploaded(_id: string, manifest: PersonaCreationPhotoManifest[]) {
    this.uploaded = manifest;
    return { id: this.reservation.id, state: "uploaded" as const };
  }
  async abort() { this.aborted++; }
  async claimExpiredReservations() { return []; }
  async markExpiredCleanupComplete() {}
  async readFinalized() { return this.finalize(); }
  async claimOutbox() { return null; }
  async claimOutboxForReservation() { return null; }
  async markOutboxSent() {}
  async finalize(): Promise<FinalizedPersonaCreation> {
    this.finalized++;
    if (this.failFinalize) throw new Error("injected finalize crash");
    return { id: this.reservation.id, personaId: "persona-1", state: "finalized", outboxEventId: "event-1" };
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
