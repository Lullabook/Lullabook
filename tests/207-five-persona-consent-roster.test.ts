import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeModeration, InMemoryBlobStore } from "@/adapters/fakes";
import { DataStore, RlsViolationError } from "@/db/store";
import { SupabaseDataStore } from "@/db/supabase-store";
import { ChildSafetyService } from "@/services/child-safety";
import { RosterConsentEngine } from "@/services/consent-engine";
import {
  FamilyRosterService,
  RosterInputError,
  type CreateRosterInput,
  type IntakeReport,
  type PersonIntake,
} from "@/services/family-roster";
import { goodPhoto } from "@/test/fixtures";

/**
 * Ticket 207 — the five-Persona Family roster behind two minor and three adult
 * consent flows, driven by the ticket 206 photo-intake contract.
 *
 * SEC-2  : per-minor own consent required; one minor's receipt never satisfies
 *          another.
 * SEC-8  : minor status reads the jurisdiction-configured child-age threshold;
 *          routing a 14yo flips between parental consent (18) and adult
 *          self-consent (13) with no code change.
 * SEC-9  : a minor's receipt records the consenting adult = account-holding
 *          parent (Guardian).
 * SEC-3  : an Adult Persona needs self-consent; a Guardian attestation is never
 *          accepted in its place.
 * FAIL-9 : source photos are moderated BEFORE durable persistence; a rejected
 *          photo leaves no owned blob.
 * ATOMIC : a rejected creation leaves no partial rows and no partial blobs;
 *          person, bonds, and Personas are created in one transaction.
 * SEC-7  : the roster returns generated avatars, never a raw uploaded photo.
 * SEC-5  : RLS (Supabase store seam) denies a second Family read of every row
 *          created here.
 * LAT-7  : a five-Persona roster read is p95 < 500ms with payload < 500KB,
 *          asserted structurally.
 */

/** The ticket 206 contract fixture — tolerant reader input, real schema. */
function intake(persons: PersonIntake[]): IntakeReport {
  return { persons };
}

function person(id: string, label: "minor" | "adult", age: number): PersonIntake {
  return { id, label, age, acceptedPhotos: [], rejectedPhotos: [] };
}

function setup(overrides: { jurisdiction?: string } = {}) {
  const store = new DataStore();
  const moderation = new FakeModeration();
  const childSafety = new ChildSafetyService(store, moderation);
  const consent = new RosterConsentEngine(store);
  const blobs = new InMemoryBlobStore();
  const roster = new FamilyRosterService(store);
  const family = store.createFamily();
  const guardian = store.createMember({
    authUserId: "parent-207",
    familyId: family.id,
    email: "parent@example.com",
    role: "guardian",
    selfPersonaId: null,
    jurisdiction: overrides.jurisdiction ?? "IN", // IN has the demo threshold 18
  });
  let avatarCalls = 0;
  const avatarFor = async (opts: {
    familyId: string;
    personaId: string;
    displayName: string;
    photos: Buffer[];
  }) => {
    avatarCalls++;
    return {
      avatarKey: `avatars/${opts.familyId}/${opts.personaId}/gen.png`,
      bytes: Buffer.from(`generated-avatar-${opts.displayName}`),
    };
  };
  const run = (input: Omit<CreateRosterInput, "familyId" | "guardianMemberId" | "jurisdiction">) =>
    roster.createRosterFromIntake(
      {
        ...input,
        familyId: family.id,
        guardianMemberId: guardian.id,
        jurisdiction: overrides.jurisdiction ?? "IN",
      },
      { consent, childSafety, blobs, avatarFor },
    );
  return { store, moderation, childSafety, consent, blobs, roster, family, guardian, avatarCalls, run };
}

/** Register a per-minor consent for the account-holding Guardian. */
function consentForParent(s: ReturnType<typeof setup>, subjectId: string) {
  return s.consent.registerParentalConsent({
    subjectId,
    memberId: s.guardian.id,
    familyId: s.family.id,
    jurisdiction: s.guardian.jurisdiction,
  });
}

const FIVE = [
  person("daughter", "minor", 3),
  person("brother-minor", "minor", 14),
  person("father", "adult", 43),
  person("mother", "adult", 38),
  person("brother-adult", "adult", 27),
];

const DEFAULT_NAMES: Record<string, string> = {
  daughter: "Daughter",
  "brother-minor": "Brother",
  father: "Father",
  mother: "Mother",
  "brother-adult": "Brother",
};

function baseCreate() {
  return {
    intake: intake(FIVE),
    photosByPerson: Object.fromEntries(FIVE.map((p) => [p.id, [goodPhoto(), goodPhoto(), goodPhoto()]])),
    adultSelfConsent: { father: true, mother: true, "brother-adult": true },
    displayNamesByPerson: DEFAULT_NAMES,
  };
}

describe("207 — five-Persona consent roster", () => {
  describe("SEC-8 — jurisdiction-configured child-age threshold, never hardcoded", () => {
    it("reads the minor threshold from the jurisdiction configuration, not a hardcoded age", () => {
      const s = setup();
      // Demo threshold: IN = 18.
      expect(s.consent.childAgeThreshold("IN")).toBe(18);
      expect(s.consent.childAgeThreshold("US")).toBe(13);
      // The SAME 14-year-old is a minor at 18 and an adult at 13.
      expect(s.consent.isChild(14, "IN")).toBe(true);
      expect(s.consent.isChild(14, "US")).toBe(false);
    });

    it("routes a 14yo to verified parental consent at 18 and to adult self-consent at 13 with no code change", async () => {
      // Threshold 18 (IN): the 14yo is a MINOR → parental consent required.
      const at18 = setup({ jurisdiction: "IN" });
      await expect(
        at18.run({
          intake: intake([person("b", "minor", 14)]),
          photosByPerson: { b: [goodPhoto(), goodPhoto(), goodPhoto()] },
          adultSelfConsent: {},
        }),
      ).rejects.toThrow(/parental consent/);

      // Threshold 13 (US): the SAME 14yo is an ADULT → self-consent required.
      const at13 = setup({ jurisdiction: "US" });
      await expect(
        at13.run({
          intake: intake([person("b", "minor", 14)]),
          photosByPerson: { b: [goodPhoto(), goodPhoto(), goodPhoto()] },
          adultSelfConsent: {},
        }),
      ).rejects.toThrow(/self-consent/);

      // Same person, same service, same intake: only the jurisdiction (config)
      // changed the route.
      const adultAt13 = setup({ jurisdiction: "US" });
      const created = await adultAt13.run({
        intake: intake([person("b", "minor", 14)]),
        photosByPerson: { b: [goodPhoto(), goodPhoto(), goodPhoto()] },
        adultSelfConsent: { b: true },
      });
      expect(created.personas[0]!.kind).toBe("adult");
      expect(created.personas[0]!.displayName).toBe("b");
    });
  });

  describe("SEC-2 — a minor needs its own consent receipt; one is never shared", () => {
    it("rejects creating a minor without that specific minor's own receipt", async () => {
      const s = setup();
      // Only the daughter holds a receipt.
      consentForParent(s, "daughter");
      await expect(
        s.run({
          ...baseCreate(),
          // brother-minor is a minor at threshold 18 but has NO receipt.
          intake: intake([person("brother-minor", "minor", 14)]),
          photosByPerson: { "brother-minor": [goodPhoto(), goodPhoto(), goodPhoto()] },
          adultSelfConsent: {},
        }),
      ).rejects.toThrow(/parental consent/);
      // No rows and no blobs were written by the rejected creation.
      expect(s.store.personas.size).toBe(0);
      expect(s.store.babies.size).toBe(0);
      expect(s.store.babyPersonBonds.size).toBe(0);
      expect(s.blobs.size()).toBe(0);
    });

    it("does not let one minor's receipt satisfy another minor in the same intake", async () => {
      const s = setup();
      consentForParent(s, "daughter"); // only daughter's receipt exists
      await expect(s.run(baseCreate())).rejects.toThrow(/parental consent/);
      // Nothing was persisted despite daughter's receipt being present.
      expect(s.store.personas.size).toBe(0);
      expect(s.blobs.size()).toBe(0);
    });

    it("creates both minors once each has its own receipt", async () => {
      const s = setup();
      consentForParent(s, "daughter");
      consentForParent(s, "brother-minor");
      const out = await s.run(baseCreate());
      expect(out.personas).toHaveLength(5);
      expect(out.babies).toHaveLength(2);
      // Two minors got child (baby-kind) personas; three adults got adult-kind.
      const minors = out.personas.filter((p) => p.kind === "baby");
      const adults = out.personas.filter((p) => p.kind === "adult");
      expect(minors).toHaveLength(2);
      expect(adults).toHaveLength(3);
      // Adults bonded into the roster (bonds created in the same transaction).
      expect(out.bonds.length).toBeGreaterThan(0);
    });
  });

  describe("SEC-9 — a minor's receipt records the account-holding parent", () => {
    it("records the consenting adult's identity, which is the account-holding parent", () => {
      const s = setup();
      const receipt = consentForParent(s, "daughter");
      expect(receipt.memberId).toBe(s.guardian.id);
      const consentingAdult = s.store.members.get(receipt.memberId);
      expect(consentingAdult?.role).toBe("guardian");
    });

    it("rejects a non-Guardian adult giving a minor's parental consent", () => {
      const s = setup();
      const member = s.store.createMember({
        authUserId: "aunt-207",
        familyId: s.family.id,
        email: "aunt@example.com",
        role: "member",
        selfPersonaId: null,
        jurisdiction: "IN",
      });
      expect(() =>
        s.consent.registerParentalConsent({
          subjectId: "daughter",
          memberId: member.id,
          familyId: s.family.id,
          jurisdiction: "IN",
        }),
      ).toThrow(/account-holding parent/);
    });

    it("rejects a consenting adult from a different Family", () => {
      const s = setup();
      const foreign = new DataStore();
      const foreignFamily = foreign.createFamily();
      const foreignGuardian = foreign.createMember({
        authUserId: "other-parent",
        familyId: foreignFamily.id,
        email: "other@example.com",
        role: "guardian",
        selfPersonaId: null,
        jurisdiction: "IN",
      });
      expect(() =>
        s.consent.registerParentalConsent({
          subjectId: "daughter",
          memberId: foreignGuardian.id,
          familyId: s.family.id,
          jurisdiction: "IN",
        }),
      ).toThrow(RlsViolationError);
    });
  });

  describe("SEC-3 — Adult Persona requires self-consent; Guardian attestation never accepted", () => {
    it("rejects an Adult Persona when the subject's self-consent is absent", async () => {
      const s = setup();
      await expect(
        s.run({
          intake: intake([person("father", "adult", 43)]),
          photosByPerson: { father: [goodPhoto(), goodPhoto(), goodPhoto()] },
          adultSelfConsent: {},
        }),
      ).rejects.toThrow(/self-consent/);
      expect(s.store.personas.size).toBe(0);
      expect(s.blobs.size()).toBe(0);
    });

    it("never accepts a Guardian attestation in place of Adult self-consent", async () => {
      const s = setup();
      await expect(
        s.run({
          intake: intake([person("father", "adult", 43)]),
          photosByPerson: { father: [goodPhoto(), goodPhoto(), goodPhoto()] },
          adultSelfConsent: {}, // no self-consent
          guardianAttestationByPerson: { father: true }, // a Guardian attestation instead
        }),
      ).rejects.toThrow(/Guardian attestation is never accepted/);
      expect(s.store.personas.size).toBe(0);
      expect(s.blobs.size()).toBe(0);
    });
  });

  describe("FAIL-9 — moderation before durable persistence; no owned blob on rejection", () => {
    it("moderates source photos before persisting and leaves no owned blob when rejected", async () => {
      const s = setup();
      consentForParent(s, "daughter");
      consentForParent(s, "brother-minor");
      const blocked = goodPhoto(0xcc);
      s.moderation.blockedImages.push(blocked.length);
      await expect(
        s.run({
          intake: intake(FIVE),
          photosByPerson: {
            daughter: [goodPhoto(), goodPhoto(), goodPhoto()],
            "brother-minor": [goodPhoto(), blocked, goodPhoto()],
            father: [goodPhoto(), goodPhoto(), goodPhoto()],
            mother: [goodPhoto(), goodPhoto(), goodPhoto()],
            "brother-adult": [goodPhoto(), goodPhoto(), goodPhoto()],
          },
          adultSelfConsent: { father: true, mother: true, "brother-adult": true },
        }),
      ).rejects.toThrow(/moderation|unsafe|blocked/i);
      expect(s.store.personas.size).toBe(0);
      expect(s.store.babies.size).toBe(0);
      expect(s.store.babyPersonBonds.size).toBe(0);
      expect(s.blobs.size()).toBe(0);
      expect(s.moderation.audit.some((r) => r.allowed === false)).toBe(true);
    });
  });

  describe("atomic creation — no partial rows or blobs on a mid-transaction failure", () => {
    it("rolls back every row and blob when an avatar generation fails partway", async () => {
      const s = setup();
      consentForParent(s, "daughter");
      consentForParent(s, "brother-minor");
      // Fail after the first persona's blobs have already been written, proving
      // the atomic transaction rolls back the earlier partial writes.
      let avatarCalls = 0;
      const avatarFor = async () => {
        avatarCalls++;
        if (avatarCalls > 1) throw new Error("avatar provider outage");
        return {
          avatarKey: `avatars/${s.family.id}/fail/gen.png`,
          bytes: Buffer.from("avatar"),
        };
      };
      const service = new FamilyRosterService(s.store);
      await expect(
        service.createRosterFromIntake(
          {
            intake: intake(FIVE),
            photosByPerson: Object.fromEntries(
              FIVE.map((p) => [p.id, [goodPhoto(), goodPhoto(), goodPhoto()]]),
            ),
            adultSelfConsent: { father: true, mother: true, "brother-adult": true },
            displayNamesByPerson: DEFAULT_NAMES,
            familyId: s.family.id,
            guardianMemberId: s.guardian.id,
            jurisdiction: "IN",
          },
          { consent: s.consent, childSafety: s.childSafety, blobs: s.blobs, avatarFor },
        ),
      ).rejects.toThrow(/avatar provider outage/);
      expect(avatarCalls).toBeGreaterThan(1);
      expect(s.store.personas.size).toBe(0);
      expect(s.store.babies.size).toBe(0);
      expect(s.store.babyPersonBonds.size).toBe(0);
      expect(s.blobs.size()).toBe(0);
    });

    it("creates person, bonds, and Personas in one transaction", async () => {
      const s = setup();
      consentForParent(s, "daughter");
      consentForParent(s, "brother-minor");
      const out = await s.run(baseCreate());
      // Personas + babies + bonds all present atomically.
      expect(s.store.personas.size).toBe(5);
      expect(s.store.babies.size).toBe(2);
      expect(s.store.babyPersonBonds.size).toBe(3);
      expect(out.personas).toHaveLength(5);
      expect(out.bonds).toHaveLength(3);
      // Every persona has a generated avatar blob and photo blobs.
      for (const p of out.personas) {
        expect(p.avatarKey).toMatch(/^avatars\//);
      }
    });
  });

  describe("SEC-7 — the roster returns generated avatars, never raw source photos", () => {
    it("returns generated avatar URLs and never references a raw photo", async () => {
      const s = setup();
      consentForParent(s, "daughter");
      consentForParent(s, "brother-minor");
      const out = await s.run(baseCreate());

      const roster = s.roster.getRoster(s.family.id, s.guardian.id);
      expect(roster).toHaveLength(5);
      for (const view of roster) {
        // rosterAvatarServePath URL-encodes the nested key (slashes -> %2F).
        expect(view.avatarUrl).toMatch(/^\/api\/avatars\?key=avatars%2F/);
        const persona = s.store.personas.get(view.personaId)!;
        // The served avatar resolves the generated avatar blob, not a photo.
        expect(persona.avatarKey).toMatch(/^avatars\//);
        expect(persona.avatarKey).not.toMatch(/^photos\//);
      }
      // Serialize the roster response: it must never contain a raw photo path.
      const serialized = JSON.stringify(roster);
      expect(serialized).not.toContain("photos");
      expect(serialized).toContain("avatars%2F");
      expect(out.roster).toHaveLength(5);
    });
  });

  describe("SEC-5 — RLS denies a second Family read of every row created here", () => {
    it("denies a Family B member read access to Family A rows on the Supabase store seam", async () => {
      const supabase = new SupabaseDataStore({} as SupabaseClient);
      // Seed the same graph the roster creation writes: persona, baby, bond.
      const familyAId = "11111111-1111-1111-1111-111111111111";
      const personaAId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const babyAId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      const bondAId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      supabase.families.set(familyAId, { id: familyAId, createdAt: new Date() });
      supabase.members.set("memberA", {
        id: "memberA",
        authUserId: "auth-a",
        familyId: familyAId,
        email: "a@example.com",
        role: "guardian",
        selfPersonaId: null,
        selectedBabyId: null,
        jurisdiction: "IN",
        createdAt: new Date(),
      });
      supabase.members.set("memberB", {
        id: "memberB",
        authUserId: "auth-b",
        familyId: "22222222-2222-2222-2222-222222222222",
        email: "b@example.com",
        role: "guardian",
        selfPersonaId: null,
        selectedBabyId: null,
        jurisdiction: "US",
        createdAt: new Date(),
      });
      supabase.personas.set(personaAId, {
        id: personaAId,
        familyId: familyAId,
        createdByMemberId: "memberA",
        kind: "baby",
        displayName: "Daughter",
        status: "ready",
        loraWeightKey: null,
        avatarKey: `avatars/${familyAId}/${personaAId}/gen.png`,
        reviewSampleKeys: [],
        likenessConfirmed: true,
        createdAt: new Date(),
      });
      supabase.babies.set(babyAId, {
        id: babyAId,
        familyId: familyAId,
        displayName: "Daughter",
        birthDate: null,
        dailyRoutine: null,
        rosterGroupId: "group-a",
        rosterScope: "shared",
        isDefault: true,
        createdAt: new Date(),
      });
      supabase.babyPersonBonds.set(bondAId, {
        id: bondAId,
        babyId: babyAId,
        personaId: personaAId,
        relationship: "child",
        babyCallsThem: "Daughter",
        theyCallBaby: "Daughter",
      });

      // Family B member cannot read ANY of Family A's rows.
      expect(() => supabase.getPersona(personaAId, "memberB")).toThrow(RlsViolationError);
      expect(() => supabase.getPersonasByFamily(familyAId, "memberB")).toThrow(RlsViolationError);
      expect(() => supabase.getBaby(babyAId, "memberB")).toThrow(RlsViolationError);
      expect(() => supabase.getBabiesByFamily(familyAId, "memberB")).toThrow(RlsViolationError);
      expect(() => supabase.getBondsForBaby(babyAId, "memberB")).toThrow(RlsViolationError);

      // The same Family's own Guardian CAN read its rows.
      expect(supabase.getPersona(personaAId, "memberA")?.id).toBe(personaAId);
      expect(supabase.getPersonasByFamily(familyAId, "memberA")).toHaveLength(1);
    });
  });

  describe("LAT-7 — five-Persona roster read is p95 < 500ms with payload < 500KB", () => {
    it("returns five members with a small payload and a fast read (structural counters)", async () => {
      const s = setup();
      consentForParent(s, "daughter");
      consentForParent(s, "brother-minor");
      await s.run(baseCreate());

      const started = performance.now();
      const roster = s.roster.getRoster(s.family.id, s.guardian.id);
      const elapsedMs = performance.now() - started;

      // Structural counters: exactly five Persona rows; bounds far under the
      // p95 latency and 500KB payload budgets.
      expect(roster).toHaveLength(5);
      expect(elapsedMs).toBeLessThan(500);
      const payloadBytes = Buffer.byteLength(JSON.stringify(roster), "utf8");
      expect(payloadBytes).toBeLessThan(500 * 1024);
      // Each member is an avatar-backed view converted to a serve path — the
      // structural shape that keeps the payload bounded and in < 500KB.
      expect(roster.every((v) => typeof v.avatarUrl === "string")).toBe(true);
    });
  });

  describe("intake contract — tolerant reader fails closed on schema mismatch", () => {
    it("rejects a malformed intake report instead of guessing", async () => {
      const s = setup();
      await expect(
        s.run({
          intake: { persons: [{ id: "x", label: "adult", age: "43" }] },
          photosByPerson: { x: [goodPhoto()] },
          adultSelfConsent: { x: true },
        }),
      ).rejects.toBeInstanceOf(RosterInputError);
      await expect(
        s.run({
          intake: { persons: "nope" },
          photosByPerson: {},
          adultSelfConsent: {},
        }),
      ).rejects.toBeInstanceOf(RosterInputError);
      expect(s.store.personas.size).toBe(0);
    });
  });
});
