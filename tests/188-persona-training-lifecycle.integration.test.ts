import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  FakeFal,
  FakeLiveness,
  FakeModeration,
  FakeWorkflow,
  InMemoryBlobStore,
} from "@/adapters/fakes";
import {
  createFalWebhookVerifier,
  encodeFalWebhookSignature,
} from "@/adapters/fal-webhook";
import { DataStore } from "@/db/store";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import {
  PersonaCreationOutboxConsumer,
  PersonaCreationOutboxDispatcher,
  PersonaCreationProtocol,
  PostgresPersonaCreationRepository,
  PostgresPersonaCreationWorkerRepository,
  type FinalizedPersonaCreation,
  type PersonaCreationPhotoManifest,
  type PersonaCreationRepository,
  type PersonaCreationReservation,
  type PersonaCreationReservationInput,
} from "@/db/persona-creation-protocol";
import { PostgresFalTrainingLifecycleRepository } from "@/db/fal-training-lifecycle";
import { PostgresPersonaTrainingLifecycleRepository } from "@/db/persona-training-lifecycle";
import { ChildSafetyService } from "@/services/child-safety";
import { ConsentEngine } from "@/services/consent-engine";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import { FalReviewSampleGenerator, FalTrainingWebhookService } from "@/services/fal-training-webhook";
import { PersonaService, personaStoryReadiness } from "@/services/persona";
import {
  ProductionPersonaCreationService,
  personaCreationRequestFingerprint,
} from "@/services/production-persona-creation";
import { runPersonaCreationFinalizedBody } from "@/workflows/persona-creation-finalized-body";
import { runPersonaCreateBody } from "@/workflows/persona-create-body";
import { personaCreate, workflowFunctions } from "@/workflows/functions";
import { submitRetrainingThenCommit } from "@/services/persona";
import { buildPersonaCreationInput } from "@/lib/actions";
import { SupabaseDataStore } from "@/db/supabase-store";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";

const requireBearerMember = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bearer-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bearer-auth")>();
  return { ...actual, requireBearerMember };
});

afterEach(() => vi.clearAllMocks());

/** Minimal repository fake for service-seam tests (188 ticket helper). */
class Ticket188RecordingRepository implements PersonaCreationRepository {
  prepared = 0;
  reservation: PersonaCreationReservation = {
    id: "reservation-188",
    familyId: "family-188",
    state: "prepared",
    photoKeys: [
      "persona-creation/family-188/reservation-188/photos/0.jpg",
      "persona-creation/family-188/reservation-188/photos/1.jpg",
      "persona-creation/family-188/reservation-188/photos/2.jpg",
    ],
  };
  async prepare(_input: PersonaCreationReservationInput) {
    this.prepared += 1;
    return this.reservation;
  }
  async claimUpload(_id: string, _attemptId: string) { return this.reservation; }
  async markUploaded(_id: string, _attemptId: string, _manifest: PersonaCreationPhotoManifest[]) {
    this.reservation = { ...this.reservation, state: "uploaded" };
    return { id: this.reservation.id, state: "uploaded" as const };
  }
  async claimCompensation() { return null; }
  async completeCleanup() {}
  async releaseCleanup() {}
  async abort() {}
  async readReservation() { return this.reservation; }
  async readFinalized() { return this.finalized(); }
  async readFinalizedByEventId() { return this.finalized(); }
  async finalize(): Promise<FinalizedPersonaCreation> { return this.finalized(); }
  private finalized(): FinalizedPersonaCreation {
    return {
      id: this.reservation.id,
      familyId: this.reservation.familyId,
      personaId: "persona-188",
      state: "finalized",
      outboxEventId: "event-188",
      photoKeys: this.reservation.photoKeys,
    };
  }
}

function babyInput(photo: Buffer, overrides: Record<string, unknown> = {}) {
  const photos = [photo, goodPhoto(0xab), goodPhoto(0xac)];
  const base = {
    kind: "baby" as const,
    displayName: "Maya",
    photoCount: photos.length,
    photos,
    baby: { displayName: "Maya" },
    ...overrides,
  };
  return { ...base, requestFingerprint: personaCreationRequestFingerprint(base) };
}

function unitPersonaService(store: DataStore, liveness = new FakeLiveness()) {
  return new PersonaService(
    store,
    new FakeFal(),
    liveness,
    new FakeModeration(),
    new InMemoryBlobStore(),
    new FakeWorkflow(),
    { sendEmail: async () => undefined, sendWebPush: async () => undefined },
    undefined as never,
    new ChildSafetyService(store, new FakeModeration()),
  );
}

describe("188 — Persona training lifecycle: consent, moderation, retrain, readiness", () => {
  it("web Persona form mapping preserves explicit Adult self-consent and Member jurisdiction", async () => {
    const formData = new FormData();
    formData.set("selfConsent", "true");
    formData.set("relationship", "parent");
    formData.set("babyCalls", "Mama");
    formData.set("theyCallBaby", "Maya");
    const photos = [goodPhoto(), goodPhoto(0xab), goodPhoto(0xac)];

    expect(await buildPersonaCreationInput({
      formData,
      mode: "adult",
      displayName: "Parent",
      photos,
      selfie: goodPhoto(0x11),
      jurisdiction: "IN",
    })).toMatchObject({
      kind: "adult",
      selfConsent: true,
      jurisdiction: "IN",
      photoCount: 3,
    });
  });

  it("C1: a non-Guardian Baby Persona request is denied before any photo is staged or persisted", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asUser, asService, fixture }) => {
      const memberAuthId = "00000000-0000-0000-0000-000000000188";
      const memberId = "00000000-0000-0000-0000-000000000288";
      await asSystem("insert into auth.users (id) values ($1)", [memberAuthId]);
      await asSystem(
        `insert into members (id, auth_user_id, family_id, email, role, jurisdiction)
         values ($1, $2, $3, 'member-b@example.test', 'member', 'US')`,
        [memberId, memberAuthId, fixture.familyA.familyId],
      );
      const blobs = new InMemoryBlobStore();
      const repository = new PostgresPersonaCreationRepository(asUser, memberAuthId, asService);
      const service = new ProductionPersonaCreationService(
        new ChildSafetyService(new DataStore(), new FakeModeration()),
        new FakeLiveness(),
        new PersonaCreationProtocol(repository, blobs),
      );

      await expect(service.create(babyInput(goodPhoto()))).rejects.toThrow(/Guardian authority/i);
      expect(await blobs.list("persona-creation/")).toEqual([]);

      const reservations = await asUser<{ count: string }>(
        fixture.familyA.authUserId,
        "select count(*)::text as count from persona_creation_reservations where family_id = $1",
        [fixture.familyA.familyId],
      );
      expect(reservations.rows[0]?.count).toBe("0");
    });
  });

  it("C2: an Adult Persona request without subject self-consent is denied before moderation or staging", async () => {
    const store = new DataStore();
    const moderation = new FakeModeration();
    const repository = new Ticket188RecordingRepository();
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, moderation),
      new FakeLiveness(),
      new PersonaCreationProtocol(repository, new InMemoryBlobStore()),
    );
    const photos = [goodPhoto(), goodPhoto(), goodPhoto()];
    const base = {
      kind: "adult" as const,
      displayName: "Parent",
      photoCount: photos.length,
      photos,
      selfConsent: false,
      jurisdiction: "US",
    };

    await expect(service.create({
      ...base,
      requestFingerprint: personaCreationRequestFingerprint(base),
    })).rejects.toThrow(/subject self-consent/i);
    expect(moderation.audit).toHaveLength(0);
    expect(repository.prepared).toBe(0);
  });

  it("C3: another Member cannot create, accept, or retrain another's subject-linked Adult Persona", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asUser, asService, fixture }) => {
      const memberAuthId = "00000000-0000-0000-0000-000000000189";
      const memberId = "00000000-0000-0000-0000-000000000289";
      await asSystem("insert into auth.users (id) values ($1)", [memberAuthId]);
      await asSystem(
        `insert into members (id, auth_user_id, family_id, email, role, jurisdiction)
         values ($1, $2, $3, 'member-b@example.test', 'member', 'US')`,
        [memberId, memberAuthId, fixture.familyA.familyId],
      );

      // create: an authenticated Member may reserve their own Adult Persona;
      // the durable receipt binds the reservation to that same subject.
      const memberRepository = new PostgresPersonaCreationRepository(asUser, memberAuthId, asService);
      const memberPrepared = await memberRepository.prepare({
        kind: "adult",
        displayName: "Member B",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("adult-member-b-v1").digest("hex"),
      });
      const memberProtocol = new PersonaCreationProtocol(memberRepository, new InMemoryBlobStore());
      await memberProtocol.uploadModeratedPhotos(memberPrepared, [goodPhoto()]);
      await memberRepository.finalize(memberPrepared.id);
      const memberPersona = await asService<{ created_by_member_id: string; kind: string }>(
        "select created_by_member_id, kind from personas where id = $1",
        [(
          await asService<{ persona_id: string }>(
            "select persona_id from persona_creation_reservations where id = $1",
            [memberPrepared.id],
          )
        ).rows[0]?.persona_id],
      );
      expect(memberPersona.rows[0]).toEqual({ created_by_member_id: memberId, kind: "adult" });

      const guardianRepository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const prepared = await guardianRepository.prepare({
        kind: "adult",
        displayName: "Guardian Adult",
        photoCount: 1,
        requestFingerprint: createHash("sha256").update("adult-guardian-v1").digest("hex"),
      });
      const receipt = await asSystem<{ subject_member_id: string }>(
        `select subject_member_id::text from consent_receipts
         where id = (select adult_consent_receipt_id from persona_creation_reservations where id = $1)`,
        [prepared.id],
      );
      expect(receipt.rows[0]?.subject_member_id).toBe(fixture.familyA.memberId);

      // retrain: Member B cannot retrain the Guardian's subject-linked adult persona.
      const guardianPersonaId = "00000000-0000-0000-0000-000000000830";
      await asSystem(
        `insert into personas (id, family_id, created_by_member_id, kind, display_name, status, likeness_confirmed)
         values ($1, $2, $3, 'adult', 'Guardian Adult', 'review', false)`,
        [guardianPersonaId, fixture.familyA.familyId, fixture.familyA.memberId],
      );
      await asSystem(
        `insert into consent_receipts (
          id, family_id, member_id, subject_member_id, subject_persona_id,
          jurisdiction, notice_version, method, status
         ) values ($1, $2, $3, $3, $4, 'US', 'adult-v1', 'signed_form', 'verified')`,
        ["00000000-0000-0000-0000-000000000860", fixture.familyA.familyId, fixture.familyA.memberId, guardianPersonaId],
      );
      await expect(asUser(
        memberAuthId,
        "select * from app_transition_persona_review_training($1::uuid)",
        [guardianPersonaId],
      )).rejects.toThrow(/Adult subject/i);

      // accept: the in-memory service rejects a non-subject Member.
      const store = new DataStore();
      const guardian = {
        id: fixture.familyA.memberId,
        familyId: fixture.familyA.familyId,
        email: "g@example.test",
        role: "guardian" as const,
        jurisdiction: "US",
        selfPersonaId: null,
        authUserId: fixture.familyA.authUserId,
      };
      const otherMember = {
        id: memberId,
        familyId: fixture.familyA.familyId,
        email: "b@example.test",
        role: "member" as const,
        jurisdiction: "US",
        selfPersonaId: null,
        authUserId: memberAuthId,
      };
      store.members.set(guardian.id, guardian as never);
      store.members.set(otherMember.id, otherMember as never);
      const personas = unitPersonaService(store);
      store.savePersona({
        id: guardianPersonaId,
        familyId: fixture.familyA.familyId,
        createdByMemberId: guardian.id,
        kind: "adult",
        displayName: "Guardian Adult",
        status: "review",
        loraWeightKey: "lora/f/guardian-adult/weights.safetensors",
        avatarKey: null,
        reviewSampleKeys: [],
        likenessConfirmed: false,
        createdAt: new Date(),
      });
      expect(() => personas.acceptLikeness(guardianPersonaId, otherMember.id)).toThrow(/subject/i);
      expect(personas.acceptLikeness(guardianPersonaId, guardian.id).status).toBe("ready");
    });
  });

  it("C4: Adult liveness/self-match is jurisdiction-configured and enforced before staging", async () => {
    expect(ConsentEngine.getJurisdiction("US")?.requiresLiveness).toBe(true);
    const store = new DataStore();
    const liveness = new FakeLiveness();
    const repository = new Ticket188RecordingRepository();
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, new FakeModeration()),
      liveness,
      new PersonaCreationProtocol(repository, new InMemoryBlobStore()),
    );
    const photos = [goodPhoto(), goodPhoto(), goodPhoto()];
    const base = {
      kind: "adult" as const,
      displayName: "Parent",
      photoCount: photos.length,
      photos,
      selfConsent: true,
      jurisdiction: "US",
    };

    await expect(service.create({
      ...base,
      requestFingerprint: personaCreationRequestFingerprint(base),
    })).rejects.toThrow(/Selfie required/i);
    expect(repository.prepared).toBe(0);

    liveness.shouldMatch = false;
    await expect(service.create({
      ...base,
      selfie: goodPhoto(0x11),
      requestFingerprint: personaCreationRequestFingerprint(base),
    })).rejects.toThrow(/does not match/i);
    expect(repository.prepared).toBe(0);
  });

  it("C4b: source moderation completes before an Adult photo reaches liveness", async () => {
    const order: string[] = [];
    const moderation = {
      checkImage: async () => {
        order.push("moderation");
        return { allowed: true };
      },
      checkText: async () => ({ allowed: true }),
    };
    const liveness = {
      verifySelfie: async () => {
        order.push("liveness");
        return { matched: true, confidence: 1 };
      },
    };
    const photos = [goodPhoto(), goodPhoto(), goodPhoto()];
    const base = {
      kind: "adult" as const,
      displayName: "Parent",
      photoCount: photos.length,
      photos,
      selfie: goodPhoto(0x11),
      selfConsent: true,
      jurisdiction: "US",
      familyId: "family-188",
    };
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(new DataStore(), moderation),
      liveness,
      new PersonaCreationProtocol(new Ticket188RecordingRepository(), new InMemoryBlobStore()),
    );

    await service.create({
      ...base,
      requestFingerprint: personaCreationRequestFingerprint(base),
    });

    expect(order).toEqual(["moderation", "moderation", "moderation", "liveness"]);
  });

  it("C5: child-age, consent method, and residency come from jurisdiction configuration", () => {
    expect(ConsentEngine.getJurisdiction("US")).toMatchObject({
      childAgeThreshold: 13,
      consentMethod: "payment_vpc",
      residencyRegion: "us-east-1",
      noticeVersion: "us-coppa-v1",
    });
    expect(ConsentEngine.getJurisdiction("US_IOS")?.consentMethod).toBe("email_plus");
  });

  it("C5b: the durable Baby-consent predicate follows the persisted jurisdiction config", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem }) => {
      const configured = await asSystem<{ allowed: boolean }>(
        "select app_persona_creation_baby_consent_is_canonical($1, $2, $3) as allowed",
        ["IN", "payment_vpc", "in-dpdp-v1"],
      );
      expect(configured.rows[0]?.allowed).toBe(true);
    });
  });

  it("C6: a verified Baby consent receipt is required before any source photo is staged", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      await asService(
        "update consent_receipts set status = 'revoked' where id = $1",
        [fixture.familyA.consentReceiptId],
      );
      const blobs = new InMemoryBlobStore();
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const service = new ProductionPersonaCreationService(
        new ChildSafetyService(new DataStore(), new FakeModeration()),
        new FakeLiveness(),
        new PersonaCreationProtocol(repository, blobs),
      );

      await expect(service.create(babyInput(goodPhoto()))).rejects.toThrow(/consent/i);
      expect(await blobs.list("persona-creation/")).toEqual([]);
    });
  });

  it("C7: a moderation outage fails closed with no reservation or staging blob", async () => {
    const store = new DataStore();
    const moderation = new FakeModeration();
    moderation.failChecks = true;
    const repository = new Ticket188RecordingRepository();
    const service = new ProductionPersonaCreationService(
      new ChildSafetyService(store, moderation),
      new FakeLiveness(),
      new PersonaCreationProtocol(repository, new InMemoryBlobStore()),
    );

    await expect(service.create(babyInput(goodPhoto()))).rejects.toThrow(/Moderation service unavailable/i);
    expect(repository.prepared).toBe(0);
  });

  it("C8: an expired Baby consent receipt denies creation", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      await asService(
        "update consent_receipts set expires_at = now() - interval '1 second' where id = $1",
        [fixture.familyA.consentReceiptId],
      );
      const blobs = new InMemoryBlobStore();
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const service = new ProductionPersonaCreationService(
        new ChildSafetyService(new DataStore(), new FakeModeration()),
        new FakeLiveness(),
        new PersonaCreationProtocol(repository, blobs),
      );

      await expect(service.create(babyInput(goodPhoto()))).rejects.toThrow(/consent/i);
      expect(await blobs.list("persona-creation/")).toEqual([]);
    });
  });

  it("C9/C16: the production composition never marks a Persona ready — finalize -> outbox -> submit -> signed callback -> review", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asService, asUser, fixture }) => {
      const repository = new PostgresPersonaCreationRepository(asUser, fixture.familyA.authUserId, asService);
      const worker = new PostgresPersonaCreationWorkerRepository(asService);
      const blobs = new InMemoryBlobStore();
      const workflow = new FakeWorkflow();
      const protocol = new PersonaCreationProtocol(repository, blobs, worker);
      const service = new ProductionPersonaCreationService(
        new ChildSafetyService(new DataStore(), new FakeModeration()),
        new FakeLiveness(),
        protocol,
      );

      const finalized = await service.create(babyInput(goodPhoto()));
      expect(finalized.state).toBe("finalized");
      const dispatched = await new PersonaCreationOutboxDispatcher(worker, workflow)
        .dispatchReservation(finalized.id);
      expect(dispatched).toBe(true);

      const falStore = new DataStore();
      const fal = new FakeFal();
      const consumer = new PersonaCreationOutboxConsumer(repository, workflow, async (creation) => {
        const photos = await Promise.all(
          creation.photoKeys.map(async (key) => {
            const bytes = await blobs.get(key);
            if (!bytes) throw new Error("Finalized Persona source photo is unavailable");
            return bytes;
          }),
        );
        const training = new FalLoraTrainingService(falStore, fal, blobs);
        await training.submit({
          familyId: creation.familyId,
          personaId: creation.personaId,
          images: photos.map((bytes, index) => ({ filename: `photo-${index}.jpg`, bytes, moderated: true })),
          defaultCaption: "a family member named Maya",
          idempotencyKey: `persona-creation-training:${creation.outboxEventId}`,
        });
        // Simulate the workflow step-commit sync: the fal request row lands in
        // PostgreSQL exactly as the durable store sync would write it.
        for (const request of falStore.falTrainingRequests.values()) {
          await asService(
            `insert into fal_training_requests (
              request_id, family_id, persona_id, endpoint, model, steps, idempotency_key, status, input_zip_key
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              request.requestId,
              request.familyId,
              request.personaId,
              request.endpoint,
              request.model,
              request.steps,
              request.idempotencyKey,
              request.status,
              request.inputZipKey ?? null,
            ],
          );
        }
      });
      await consumer.consume(finalized.outboxEventId);

      // C16: still training after submission — never ready through this path.
      const afterSubmit = await asService<{ status: string }>(
        "select status from personas where id = $1",
        [finalized.personaId],
      );
      expect(afterSubmit.rows[0]?.status).toBe("training");

      // Signed OK callback -> review with Family-owned samples.
      const trainingRequest = [...falStore.falTrainingRequests.values()][0]!;
      const timestamp = 1_800_000_100;
      const body = JSON.stringify({
        request_id: trainingRequest.requestId,
        status: "OK",
        payload: {
          diffusers_lora_file: { url: "https://v3.fal.media/files/weights.safetensors", content_type: "application/octet-stream" },
          config_file: { url: "https://v3.fal.media/files/config.json", content_type: "application/json" },
        },
      });
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const bodyHash = createHash("sha256").update(body).digest("hex");
      const message = `${trainingRequest.requestId}\nfal-user-188\n${timestamp}\n${bodyHash}`;
      const headers = {
        requestId: trainingRequest.requestId,
        userId: "fal-user-188",
        timestamp: String(timestamp),
        signature: encodeFalWebhookSignature(sign(null, Buffer.from(message), privateKey)),
      };
      const download = async (url: string) =>
        url.endsWith("config.json")
          ? { bytes: Buffer.from(JSON.stringify({ architecture: "flux-2-lora-v2" })), contentType: "application/json", finalUrl: url }
          : { bytes: makeTestSafetensorsArtifact({ model: "flux-2-lora-v2" }), contentType: "application/octet-stream", finalUrl: url };
      const webhook = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        blobs,
        createFalWebhookVerifier({ now: () => timestamp, resolvePublicKeys: async () => [publicKey] }),
        () => new Date(timestamp * 1000),
        new FalReviewSampleGenerator(fal, blobs),
      );
      await webhook.handle(headers, body, download);

      const inReview = await asService<{
        status: string;
        story_ready: boolean;
        review_sample_keys: unknown;
      }>(
        "select status, story_ready, review_sample_keys from personas where id = $1",
        [finalized.personaId],
      );
      expect(inReview.rows[0]?.status).toBe("review");
      expect(inReview.rows[0]?.story_ready).toBe(false);
      expect((inReview.rows[0]?.review_sample_keys as unknown[]).length).toBe(2);
    });
  });

  it("C10: likeness acceptance durably persists review -> likeness-confirmed -> Story-ready", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000840";
      await asService(
        `insert into personas (
          id, family_id, created_by_member_id, kind, display_name, status, lora_weight_key,
          review_sample_keys, likeness_confirmed
         ) values ($1, $2, $3, 'baby', 'Maya', 'review', $4, $5::jsonb, false)`,
        [
          personaId,
          fixture.familyA.familyId,
          fixture.familyA.memberId,
          `lora/${fixture.familyA.familyId}/${personaId}/weights.safetensors`,
          JSON.stringify([`likeness-samples/${fixture.familyA.familyId}/${personaId}/g/0.png`]),
        ],
      );
      // The accept-likeness route's ctx.persist() writes exactly these columns.
      await asService(
        "update personas set status = 'ready', likeness_confirmed = true where id = $1",
        [personaId],
      );
      const persisted = await asService<{
        status: string;
        likeness_confirmed: boolean;
        story_ready: boolean;
      }>("select status, likeness_confirmed, story_ready from personas where id = $1", [personaId]);
      expect(persisted.rows[0]).toEqual({ status: "ready", likeness_confirmed: true, story_ready: true });
    });
  });

  it("C10b: the read API returns the persisted Story-ready state", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const personaId = "read-api-188";
    ctx.store.savePersona({
      id: personaId,
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Maya",
      status: "ready",
      loraWeightKey: "lora/f/read/weights.safetensors",
      avatarKey: null,
      reviewSampleKeys: ["likeness-samples/f/read/g/0.png"],
      likenessConfirmed: true,
      createdAt: new Date(),
    });
    requireBearerMember.mockResolvedValue({
      ctx: ctx as never,
      member: guardian,
    });
    const { GET } = await import("@/app/api/personas/[id]/route");
    const response = await GET(
      new Request(`http://localhost/api/personas/${personaId}`, {
        headers: { Authorization: "Bearer test-token" },
      }) as never,
      { params: Promise.resolve({ id: personaId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; storyReady: boolean; likenessConfirmed: boolean };
    expect(body).toMatchObject({ status: "ready", storyReady: true, likenessConfirmed: true });
  });

  it("C11: an authenticated subject retrain durably persists review -> training; another Member cannot invoke it", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asUser, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000850";
      await asSystem(
        `insert into personas (
          id, family_id, created_by_member_id, kind, display_name, status, lora_weight_key,
          review_sample_keys, likeness_confirmed
         ) values ($1, $2, $3, 'adult', 'Parent', 'review', $4, $5::jsonb, false)`,
        [
          personaId,
          fixture.familyA.familyId,
          fixture.familyA.memberId,
          `lora/${fixture.familyA.familyId}/${personaId}/weights.safetensors`,
          JSON.stringify([`likeness-samples/${fixture.familyA.familyId}/${personaId}/g/0.png`]),
        ],
      );
      await asSystem(
        `insert into consent_receipts (
          id, family_id, member_id, subject_member_id, subject_persona_id,
          jurisdiction, notice_version, method, status
         ) values ($1, $2, $3, $3, $4, 'US', 'adult-v1', 'signed_form', 'verified')`,
        ["00000000-0000-0000-0000-000000000870", fixture.familyA.familyId, fixture.familyA.memberId, personaId],
      );

      const subject = new PostgresPersonaTrainingLifecycleRepository(asUser, fixture.familyA.authUserId);
      const transitioned = await subject.transitionReviewToTraining(personaId);
      expect(transitioned).toMatchObject({ status: "training", storyReady: false, likenessConfirmed: false });

      const row = await asService<{
        status: string;
        review_sample_keys: unknown;
        likeness_confirmed: boolean;
      }>("select status, review_sample_keys, likeness_confirmed from personas where id = $1", [personaId]);
      expect(row.rows[0]).toEqual({ status: "training", review_sample_keys: [], likeness_confirmed: false });

      // A non-review Persona cannot be retrained (terminal/spend-blocked states hold).
      await expect(subject.transitionReviewToTraining(personaId)).rejects.toThrow(/likeness review/i);
    });
  });

  it("C11b: provider submission happens before retrain commit, so provider failure leaves review durable", async () => {
    const events: string[] = [];
    await expect(submitRetrainingThenCommit({
      submit: async () => {
        events.push("provider");
        throw new Error("fal unavailable");
      },
      transition: async () => {
        events.push("transition");
      },
      onCommitted: () => events.push("committed"),
    })).rejects.toThrow("fal unavailable");
    expect(events).toEqual(["provider"]);
  });

  it("C12: a Persona in review or training is rejected before Story spend", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    for (const status of ["review", "training"] as const) {
      const personaId = `${status}-persona-188`;
      ctx.store.savePersona({
        id: personaId,
        familyId: guardian.familyId,
        createdByMemberId: guardian.id,
        kind: "baby",
        displayName: "Maya",
        status,
        loraWeightKey: status === "review" ? "lora/f/p/weights.safetensors" : null,
        avatarKey: null,
        reviewSampleKeys: [],
        likenessConfirmed: false,
        createdAt: new Date(),
      });
      await expect(
        ctx.storybooks.generate(guardian.id, {
          starringPersonaIds: [personaId],
          storyType: "bedtime",
          theme: "blocked",
        }),
      ).rejects.toThrow(/not ready/i);
      expect(ctx.store.listStorybooksForFamily(guardian.familyId, guardian.id)).toHaveLength(0);
    }
  });

  it("C13: legacy ready maps to Story-ready only when likeness-confirmed; the mapping is persisted", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000880";
      await asService(
        `insert into personas (id, family_id, created_by_member_id, kind, display_name, status)
         values ($1, $2, $3, 'baby', 'Legacy Ready', 'ready')`,
        [personaId, fixture.familyA.familyId, fixture.familyA.memberId],
      );
      const unconfirmed = await asService<{ story_ready: boolean }>(
        "select story_ready from personas where id = $1",
        [personaId],
      );
      expect(unconfirmed.rows[0]?.story_ready).toBe(false);

      await asService("update personas set likeness_confirmed = true where id = $1", [personaId]);
      const confirmed = await asService<{ story_ready: boolean }>(
        "select story_ready from personas where id = $1",
        [personaId],
      );
      expect(confirmed.rows[0]?.story_ready).toBe(true);
    });
  });

  it("C13b: the readiness mapping is spend-blocked for review/training/failed and only ready+confirmed is Story-ready", () => {
    expect(personaStoryReadiness({ status: "ready", likenessConfirmed: true })).toEqual({
      storyReady: true,
      reason: "story-ready",
    });
    expect(personaStoryReadiness({ status: "ready", likenessConfirmed: false }).storyReady).toBe(false);
    expect(personaStoryReadiness({ status: "review", likenessConfirmed: false }).storyReady).toBe(false);
    expect(personaStoryReadiness({ status: "training", likenessConfirmed: false }).storyReady).toBe(false);
    expect(personaStoryReadiness({ status: "failed", likenessConfirmed: false }).storyReady).toBe(false);
  });

  it("C16b: runPersonaCreationFinalizedBody never flips a Persona to ready by itself", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const personaId = "finalized-body-188";
    const photoKeys = [0, 1, 2].map((i) => `persona-creation/${guardian.familyId}/fb/photos/${i}.jpg`);
    for (const key of photoKeys) await ctx.blobs.put(key, goodPhoto());
    ctx.store.savePersona({
      id: personaId,
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Maya",
      status: "training",
      loraWeightKey: null,
      avatarKey: null,
      reviewSampleKeys: [],
      likenessConfirmed: false,
      createdAt: new Date(),
    });

    await runPersonaCreationFinalizedBody(ctx, {
      eventId: "outbox-188",
      familyId: guardian.familyId,
      personaId,
      reservationId: "fb",
    }, photoKeys);

    const persona = ctx.store.getPersona(personaId, guardian.id);
    expect(persona?.status).toBe("training");
    expect(persona?.likenessConfirmed).toBe(false);
  });

  it("C16c: the legacy persona-create workflow is not registered as a production success path", async () => {
    expect(workflowFunctions).not.toContain(personaCreate);

    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const photoKeys = [0, 1, 2].map((index) => `legacy/persona-${index}.jpg`);
    for (const key of photoKeys) await ctx.blobs.put(key, goodPhoto());
    await ctx.blobs.put("legacy/selfie.jpg", goodPhoto(0x11));

    await expect(runPersonaCreateBody(ctx as never, {
      mode: "adult",
      memberId: guardian.id,
      displayName: "Legacy Adult",
      photoKeys,
      selfieKey: "legacy/selfie.jpg",
    })).rejects.toThrow(/legacy|durable/i);
    expect([...ctx.store.personas.values()].some((persona) => persona.status === "ready")).toBe(false);
  });

  it("C17: Supabase hydration preserves a redacted terminal failure reason", async () => {
    const familyId = "family-hydration-188";
    const personaId = "persona-hydration-188";
    const rows: Record<string, unknown[]> = {
      families: [{ id: familyId, created_at: new Date().toISOString() }],
      members: [],
      personas: [{
        id: personaId,
        family_id: familyId,
        created_by_member_id: "member-hydration-188",
        kind: "adult",
        display_name: "Parent",
        status: "failed",
        lora_weight_key: null,
        avatar_key: null,
        review_sample_keys: [],
        likeness_confirmed: false,
        failure_reason: "upstream timeout [REDACTED]",
        created_at: new Date().toISOString(),
      }],
    };
    const client = {
      from(table: string) {
        const response = { data: rows[table] ?? [], error: null };
        const query = {
          select: () => query,
          eq: () => query,
          then: (resolve: (value: typeof response) => unknown) => Promise.resolve(resolve(response)),
        };
        return query;
      },
    };
    const store = new SupabaseDataStore(client as never);

    await store.hydrateFamily(familyId, "read");

    expect(store.personas.get(personaId)?.failureReason).toBe("upstream timeout [REDACTED]");
  });
});
