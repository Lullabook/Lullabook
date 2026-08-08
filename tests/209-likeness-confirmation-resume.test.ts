import { describe, expect, it } from "vitest";
import { FakeFal, InMemoryBlobStore } from "@/adapters/fakes";
import {
  createBriefResumeTables,
  LikenessResumeStore,
} from "@/db/likeness-resume-store";
import type { DataStore } from "@/db/store";
import { DataStore as DataStoreImpl, RlsViolationError } from "@/db/store";
import type { Member, Persona } from "@/domain/types";
import { LikenessReviewService } from "@/services/likeness-review";

/**
 * GitHub #220 / local 209 — Confirm five likenesses and resume a waiting Brief
 * exactly once across restarts (CORE build).
 *
 * The API route + native `retrainLikeness()` wiring is the follow-up lane; this
 * file proves the core review + durable-resume lifecycle at the service seam.
 */

let seq = 0;

function seedMember(store: DataStore, role: "guardian" | "member"): Member {
  seq += 1;
  const member = store.createMember({
    authUserId: `auth-${role}-${seq}`,
    familyId: firstFamilyId,
    email: `${role}${seq}@example.com`,
    role,
    jurisdiction: "US",
    selfPersonaId: null,
  });
  return member;
}

function seedBabyPersona(store: DataStore, guardian: Member): Persona {
  seq += 1;
  const persona: Persona = {
    id: `baby-persona-${seq}`,
    familyId: guardian.familyId,
    createdByMemberId: guardian.id,
    kind: "baby",
    displayName: `Baby ${seq}`,
    status: "training",
    loraWeightKey: `lora/${guardian.familyId}/baby-${seq}/weights.safetensors`,
    avatarKey: null,
    reviewSampleKeys: [],
    likenessConfirmed: false,
    createdAt: new Date(),
  };
  store.personas.set(persona.id, persona);
  return persona;
}

function seedAdultPersona(
  store: DataStore,
  creator: Member,
  subject: Member | undefined,
): Persona {
  seq += 1;
  const persona: Persona = {
    id: `adult-persona-${seq}`,
    familyId: creator.familyId,
    createdByMemberId: creator.id,
    kind: "adult",
    displayName: `Adult ${seq}`,
    status: "training",
    loraWeightKey: `lora/${creator.familyId}/adult-${seq}/weights.safetensors`,
    avatarKey: null,
    reviewSampleKeys: [],
    likenessConfirmed: false,
    createdAt: new Date(),
  };
  store.personas.set(persona.id, persona);
  if (subject) {
    const stored = store.members.get(subject.id);
    if (stored) store.members.set(subject.id, { ...stored, selfPersonaId: persona.id });
  }
  return persona;
}

let firstFamilyId = "family-220";

function setup() {
  const store = new DataStoreImpl();
  const family = store.createFamily();
  firstFamilyId = family.id;
  const guardian = seedMember(store, "guardian");
  const member = seedMember(store, "member");
  const fal = new FakeFal();
  const blobs = new InMemoryBlobStore();
  const tables = createBriefResumeTables();
  const resume = new LikenessResumeStore(tables);
  const spendCalls: string[] = [];
  const review = new LikenessReviewService({
    store,
    resume,
    fal,
    blobs,
    spendIllustration: (briefKey, storybookId) => {
      spendCalls.push(`${briefKey}:${storybookId}`);
    },
  });
  return { store, family, guardian, member, fal, blobs, tables, resume, review, spendCalls };
}

describe("209 — likeness confirmation + crash-safe Brief resume (core)", () => {
  it("training completion creates review samples + a generated Roster avatar and does NOT make the Persona Story-ready by itself", async () => {
    const { store, guardian, review, blobs } = setup();
    const persona = seedBabyPersona(store, guardian);
    const loraKey = persona.loraWeightKey!;

    await review.onTrainingReady({
      personaId: persona.id,
      falRequestId: "fal-req-1",
      loraWeightKey: loraKey,
      configArtifactKey: `lora/${persona.familyId}/${persona.id}/config.json`,
    });

    const after = store.personas.get(persona.id)!;
    // Review surface, not Story-ready.
    expect(after.status).toBe("review");
    expect(after.likenessConfirmed).not.toBe(true);
    expect(after.loraWeightKey).toBe(loraKey);
    expect(after.reviewSampleKeys!).toHaveLength(2);
    expect(after.avatarKey).not.toBeNull();
    // Every generated review sample + avatar is actually stored (review surface).
    for (const key of after.reviewSampleKeys!) {
      expect(await blobs.get(key)).not.toBeNull();
    }
    expect(await blobs.get(after.avatarKey!)).not.toBeNull();
    // Samples are generated likeness, not raw source photos.
    for (const key of after.reviewSampleKeys!) {
      expect(key).toMatch(/^likeness-samples\//);
    }
  });

  describe("accept is idempotent and authorized (SEC-3)", () => {
    it("a Guardian accepts a minor's Persona; repeat accept is a no-op", async () => {
      const { store, guardian, review } = setup();
      const persona = seedBabyPersona(store, guardian);
      await review.onTrainingReady({
        personaId: persona.id,
        falRequestId: "req-baby",
        loraWeightKey: persona.loraWeightKey!,
        configArtifactKey: "cfg",
      });

      const confirmed = review.acceptLikeness(persona.id, guardian.id);
      expect(confirmed.status).toBe("ready");
      expect(confirmed.likenessConfirmed).toBe(true);

      const again = review.acceptLikeness(persona.id, guardian.id);
      expect(again.likenessConfirmed).toBe(true);
      expect(again.status).toBe("ready");
    });

    it("a non-Guardian cannot accept a minor's Persona", async () => {
      const { store, guardian, member, review } = setup();
      const persona = seedBabyPersona(store, guardian);
      await review.onTrainingReady({
        personaId: persona.id,
        falRequestId: "req-baby2",
        loraWeightKey: persona.loraWeightKey!,
        configArtifactKey: "cfg",
      });
      expect(() => review.acceptLikeness(persona.id, member.id)).toThrow(/guardian|not authorized/i);
    });

    it("an Adult subject's self-consent boundary is preserved — only the subject accepts; a Guardian cannot act for them", async () => {
      const { store, guardian, review } = setup();
      const subject = seedMember(store, "member");
      const persona = seedAdultPersona(store, guardian, subject);
      await review.onTrainingReady({
        personaId: persona.id,
        falRequestId: "req-adult",
        loraWeightKey: persona.loraWeightKey!,
        configArtifactKey: "cfg",
      });

      // The subject accepted their own likeness.
      expect(review.acceptLikeness(persona.id, subject.id).likenessConfirmed).toBe(true);

      // A second adult without a linked subject falls back to the creating Member.
      const standalone = seedAdultPersona(store, guardian, undefined);
      await review.onTrainingReady({
        personaId: standalone.id,
        falRequestId: "req-adult2",
        loraWeightKey: standalone.loraWeightKey!,
        configArtifactKey: "cfg",
      });
      expect(review.acceptLikeness(standalone.id, guardian.id).likenessConfirmed).toBe(true);
      // A Guardian can never accept FOR a linked Adult subject.
      expect(() => review.acceptLikeness(persona.id, guardian.id)).toThrow(/subject|not authorized/i);
    });
  });

  describe("a Brief saved during training resumes exactly once (FAIL-8) with no pre-confirmation spend (COST-1)", () => {
    it("spends nothing before every selected Persona is confirmed, then resumes exactly once, and once more across a simulated restart", async () => {
      const { store, guardian, review, resume, tables, spendCalls } = setup();

      // Five Personas selected by the Brief, all confirmed by the Guardian.
      const selected = Array.from({ length: 5 }, () => {
        const persona = seedBabyPersona(store, guardian);
        persona.status = "ready";
        persona.likenessConfirmed = false;
        store.personas.set(persona.id, persona);
        return persona;
      });

      // A Brief queued while the Personas were still training.
      const brief = {
        starringPersonaIds: selected.map((p) => p.id),
        storyType: "bedtime" as const,
        theme: "sleepy moon",
      };
      await resume.saveWaitingBrief({
        memberId: guardian.id,
        personaId: selected[0].id,
        brief,
        selectedPersonaIds: selected.map((p) => p.id),
      });
      const briefKey = resume.listWaiting()[0].briefKey;

      // Confirm only four — the resume sweep must NOT spend (COST-1).
      for (const persona of selected.slice(0, 4)) {
        review.acceptLikeness(persona.id, guardian.id);
      }
      await review.resumeReadyBriefs();
      expect(spendCalls).toHaveLength(0);
      expect(resume.isResumed(briefKey)).toBe(false);

      // Confirm the fifth — now the Brief is eligible.
      review.acceptLikeness(selected[4].id, guardian.id);
      await review.resumeReadyBriefs();
      expect(spendCalls).toHaveLength(1);
      expect(resume.isResumed(briefKey)).toBe(true);

      // Re-sweeping the same live instance fires exactly-once.
      await review.resumeReadyBriefs();
      expect(spendCalls).toHaveLength(1);

      // Simulated process restart: a brand-new store over the SAME tables must
      // observe the durable marker and NOT resume again.
      const restartResume = new LikenessResumeStore(tables);
      const restartReview = new LikenessReviewService({
        store,
        resume: restartResume,
        fal: new FakeFal(),
        blobs: new InMemoryBlobStore(),
        spendIllustration: (k, id) => {
          spendCalls.push(`${k}:${id}`);
        },
      });
      await restartReview.resumeReadyBriefs();
      expect(spendCalls).toHaveLength(1);
      expect(restartResume.isResumed(briefKey)).toBe(true);
    });
  });

  describe("retraining replaces prior derivatives with no exposure and no orphan (SEC-7)", () => {
    it("retrain submits work, and a fresh completion retires the old derivatives while leaving none unreferenced", async () => {
      const { store, guardian, fal, blobs, review } = setup();
      const persona = seedBabyPersona(store, guardian);
      const firstLora = persona.loraWeightKey!;
      await review.onTrainingReady({
        personaId: persona.id,
        falRequestId: "req-v1",
        loraWeightKey: firstLora,
        configArtifactKey: "cfg-v1",
      });
      const v1 = store.personas.get(persona.id)!;
      const oldSamples = [...v1.reviewSampleKeys!];
      const oldAvatar = v1.avatarKey!;
      const oldKeys = new Set([...oldSamples, oldAvatar]);

      const sourcePhotos = [
        Buffer.from(`source-photo-1-${seq}`),
        Buffer.from(`source-photo-2-${seq}`),
      ];

      // Retrain: provider submission is the first side effect; source photos
      // are handed to the provider substrate, never persisted as owned likeness.
      const result = await review.retrainLikeness({
        personaId: persona.id,
        actorMemberId: guardian.id,
        sourcePhotos,
        defaultCaption: "retrain Maya",
      });
      expect(result.requestId).toBeTruthy();
      expect(fal.trainCalls).toBeGreaterThan(0);
      // The old likeness remains intact until its replacement is stored.
      for (const key of oldSamples) expect(await blobs.get(key)).not.toBeNull();
      expect(await blobs.get(oldAvatar)).not.toBeNull();

      // A new completion arrives after the retrain job finishes.
      const newLora = `lora/${persona.familyId}/${persona.id}/weights-v2.safetensors`;
      await review.onTrainingReady({
        personaId: persona.id,
        falRequestId: "req-v2",
        loraWeightKey: newLora,
        configArtifactKey: "cfg-v2",
      });

      const after = store.personas.get(persona.id)!;
      // Old derivatives are replaced, none orphaned.
      for (const key of oldKeys) {
        expect(await blobs.get(key)).toBeNull();
      }
      expect(after.loraWeightKey).toBe(newLora);
      expect(after.reviewSampleKeys!.length).toBeGreaterThan(0);
      for (const key of after.reviewSampleKeys!) expect(await blobs.get(key)).not.toBeNull();
      expect(await blobs.get(after.avatarKey!)).not.toBeNull();

      // SEC-7: every owned object key is still reachable (nothing unreferenced)
      // and no stored key holds a source photo. `getFamilyOwnedObjectKeys` is
      // the authoritative owned-key set from the durable store; each owned key
      // must match a currently-referenced derivative, and each stored blob must
      // be owned.
      const owned = store.getFamilyOwnedObjectKeys(guardian.familyId, guardian.id);
      const referenced = new Set([...after.reviewSampleKeys!, after.avatarKey!, after.loraWeightKey!]);
      for (const key of oldKeys) expect(owned).not.toContain(key);
      for (const key of owned) expect(referenced.has(key)).toBe(true);
      for (const key of await blobs.list("")) {
        expect(key).not.toMatch(/source-photo/i);
        expect(owned).toContain(key);
      }
    });
  });

  describe("COST-1: no illustration spend before every selected Persona is confirmed", () => {
    it("resumeReadyBriefs and the gate both refuse spend while any selected Persona is unconfirmed", async () => {
      const { store, guardian, review, resume, spendCalls } = setup();
      const a = seedBabyPersona(store, guardian);
      const b = seedBabyPersona(store, guardian);
      a.status = "ready";
      store.personas.set(a.id, a);
      await resume.saveWaitingBrief({
        memberId: guardian.id,
        personaId: a.id,
        brief: {
          starringPersonaIds: [a.id, b.id],
          storyType: "adventure",
          theme: "lost kite",
        },
        selectedPersonaIds: [a.id, b.id],
      });
      review.acceptLikeness(a.id, guardian.id);
      await review.resumeReadyBriefs();
      expect(spendCalls).toHaveLength(0);

      // The Story-generation gate hard-fails on any unconfirmed selected Persona.
      expect(() =>
        review.assertNoStorybookSpend([
          { status: "ready", likenessConfirmed: true },
          { status: "review", likenessConfirmed: false },
        ]),
      ).toThrow(/likeness.*confirm/i);
      // A fully confirmed set passes.
      expect(() =>
        review.assertNoStorybookSpend([
          { status: "ready", likenessConfirmed: true },
          { status: "ready", likenessConfirmed: true },
        ]),
      ).not.toThrow();
    });
  });

  it("RLS: a foreign Member cannot read or accept another family's Persona", () => {
    const { store, guardian, review } = setup();
    const otherFamily = store.createFamily();
    const outsider = store.createMember({
      authUserId: "auth-outsider",
      familyId: otherFamily.id,
      email: "outsider@example.com",
      role: "guardian",
      jurisdiction: "US",
      selfPersonaId: null,
    });
    const persona = seedBabyPersona(store, guardian);
    expect(() => review.acceptLikeness(persona.id, outsider.id)).toThrow(RlsViolationError);
  });
});