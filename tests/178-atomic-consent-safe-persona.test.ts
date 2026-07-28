import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseDataStore } from "@/db/supabase-store";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("178 — atomic consent-safe Family persona creation", () => {
  it("round-trips relationship and nickname fields while creating the Baby, Person bond, and Persona together", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("atomic-guardian", "guardian@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-atomic", "sub-atomic");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const created = await ctx.personas.createAtomic({
      memberId: guardian.id,
      kind: "baby",
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      baby: { displayName: "Maya", birthDate: "2024-02-03" },
      bond: {
        relationship: "daughter",
        babyCallsThem: "Mama",
        theyCallBaby: "Moonbeam",
      },
    });

    expect(created.persona.kind).toBe("baby");
    expect(created.baby?.displayName).toBe("Maya");
    expect(created.bond).toMatchObject({
      babyId: created.baby?.id,
      personaId: created.persona.id,
      relationship: "daughter",
      babyCallsThem: "Mama",
      theyCallBaby: "Moonbeam",
    });
    expect(ctx.store.getBondsForBaby(created.baby!.id, guardian.id)).toHaveLength(1);
  });

  it.each([
    ["absent", () => undefined],
    ["revoked", (ctx: ReturnType<typeof createTestContext>, memberId: string) => {
      const member = ctx.store.members.get(memberId)!;
      ctx.store.saveConsentReceipt({
        id: "revoked-receipt",
        familyId: member.familyId,
        memberId,
        jurisdiction: member.jurisdiction,
        noticeVersion: "us-coppa-v1",
        method: "payment_vpc",
        status: "revoked",
        consentedAt: new Date(),
      });
    }],
    ["expired", (ctx: ReturnType<typeof createTestContext>, memberId: string) => {
      const member = ctx.store.members.get(memberId)!;
      ctx.store.saveConsentReceipt({
        id: "expired-receipt",
        familyId: member.familyId,
        memberId,
        jurisdiction: member.jurisdiction,
        noticeVersion: "us-coppa-v1",
        method: "payment_vpc",
        status: "verified",
        expiresAt: new Date(Date.now() - 1),
        consentedAt: new Date(),
      });
    }],
    ["wrong jurisdiction", (ctx: ReturnType<typeof createTestContext>, memberId: string) => {
      const member = ctx.store.members.get(memberId)!;
      ctx.store.saveConsentReceipt({
        id: "wrong-jurisdiction-receipt",
        familyId: member.familyId,
        memberId,
        jurisdiction: "IN",
        noticeVersion: "in-dpdp-v1",
        method: "payment_vpc",
        status: "verified",
        consentedAt: new Date(),
      });
    }],
  ] as const)("rejects %s consent before any partial row or blob is created", async (_label, seedConsent) => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser(`guardian-${_label}`, "guardian@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-atomic", "sub-atomic");
    seedConsent?.(ctx, guardian.id);

    await expect(
      ctx.personas.createAtomic({
        memberId: guardian.id,
        kind: "baby",
        displayName: "Blocked Baby",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
        baby: { displayName: "Blocked Baby" },
        bond: { relationship: "child", babyCallsThem: "Mama", theyCallBaby: "Baby" },
      })
    ).rejects.toThrow(/consent/i);

    expect([...ctx.store.personas.values()]).toHaveLength(0);
    expect([...ctx.store.babies.values()]).toHaveLength(0);
    expect([...ctx.store.babyPersonBonds.values()]).toHaveLength(0);
    expect(ctx.blobs.size()).toBe(0);
    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("requires Guardian authority and the Guardian's Adult self-consent", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-adult", "guardian@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-adult", "sub-adult");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const member = ctx.store.createMember({
      authUserId: "adult-subject",
      familyId: guardian.familyId,
      email: "subject@example.com",
      role: "member",
      selfPersonaId: null,
      jurisdiction: "US",
    });

    await expect(ctx.personas.createAtomic({
      memberId: member.id,
      kind: "adult",
      displayName: "Subject",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("subject-selfie"),
      selfConsent: true,
    })).rejects.toThrow(/guardian/i);

    await expect(ctx.personas.createAtomic({
      memberId: guardian.id,
      kind: "adult",
      displayName: "Guardian",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      guardianAttestation: true,
    })).rejects.toThrow(/self-consent|selfie/i);

    const { persona: adult } = await ctx.personas.createAtomic({
      memberId: guardian.id,
      kind: "adult",
      displayName: "Guardian",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("guardian-selfie"),
      selfConsent: true,
    });
    expect(ctx.personas.acceptLikeness(adult.id, guardian.id).likenessConfirmed).toBe(true);
    expect(ctx.store.personas.size).toBe(1);
  });

  it("moderates source photos before persistence or training and rolls back a later failure", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-moderation", "guardian@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-moderation", "sub-moderation");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const blocked = goodPhoto(0xbb);
    ctx.moderation.blockedImages.push(blocked.length);

    await expect(ctx.personas.createAtomic({
      memberId: guardian.id,
      kind: "baby",
      displayName: "Unsafe",
      photos: [blocked, blocked, blocked],
      baby: { displayName: "Unsafe" },
    })).rejects.toThrow(/unsafe/i);
    expect(ctx.store.personas.size).toBe(0);
    expect(ctx.store.babies.size).toBe(0);
    expect(ctx.blobs.size()).toBe(0);
    expect(ctx.fal.trainCalls).toBe(0);

    ctx.moderation.blockedImages.length = 0;
    ctx.workflow.waitForEvent = (async () => ({
      status: "failed",
    })) as typeof ctx.workflow.waitForEvent;
    await expect(ctx.personas.createAtomic({
      memberId: guardian.id,
      kind: "baby",
      displayName: "Training Failure",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      baby: { displayName: "Training Failure" },
    })).rejects.toThrow(/training/i);
    expect([...ctx.store.personas.values()]).toHaveLength(0);
    expect([...ctx.store.babies.values()]).toHaveLength(0);
    expect([...ctx.store.babyPersonBonds.values()]).toHaveLength(0);
    expect(ctx.blobs.size()).toBe(0);
  });

  it("returns only a neutral/generated Roster avatar, never an uploaded source photo", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-avatar", "avatar@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-avatar", "sub-avatar");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const created = await ctx.personas.createAtomic({
      memberId: guardian.id,
      kind: "adult",
      displayName: "Roster Adult",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("roster-selfie"),
      selfConsent: true,
      baby: { displayName: "Avatar Baby" },
    });

    const roster = ctx.familyRoster.listForBaby(guardian.id, created.baby!.id);
    // Generation-scoped Family-owned avatar key (ticket 180) — never a raw photo.
    expect(roster[0].persona.avatarKey).toMatch(
      new RegExp(`^avatars/${guardian.familyId}/${created.persona.id}/.+\\.png$`)
    );
    expect(roster[0].persona.avatarKey).not.toMatch(/^photos\//);
    expect(roster[0].persona).not.toHaveProperty("photoKey");
    expect(roster[0].persona).not.toHaveProperty("photos");
  });

  it("round-trips consent method and all accepted lifecycle statuses through Supabase schema", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      families: [{ id: "fam-1", created_at: new Date().toISOString() }],
      members: [{ id: "mem-1", auth_user_id: "auth-1", family_id: "fam-1", email: "g@example.com", role: "guardian", self_persona_id: null, selected_baby_id: null, jurisdiction: "US", created_at: new Date().toISOString() }],
      personas: [], characters: [], subscriptions: [], consent_receipts: [], light_consent_receipts: [], storybooks: [], text_stories: [], invites: [], pending_briefs: [], purge_schedule: [], banned_accounts: [], babies: [], baby_person_bonds: [], moments: [],
      email_plus_vpc_requests: [
        ...(["requested", "link_sent", "confirmed", "revoked", "expired"] as const).map((status, i) => ({ id: `vpc-${i}`, family_id: "fam-1", member_id: "mem-1", email: "g@example.com", status, token: `secret-${i}`, notice_version: "us-coppa-v1", requested_at: new Date().toISOString(), confirmed_at: null })),
      ],
    };
    const recorded: { table: string; rows: Record<string, unknown>[] }[] = [];
    const client = createStubClient(tables, recorded);
    const store = new SupabaseDataStore(client);
    await store.hydrateByAuthUser("auth-1");

    store.saveConsentReceipt({ id: "consent-1", familyId: "fam-1", memberId: "mem-1", jurisdiction: "US", noticeVersion: "us-coppa-v1", method: "email_plus", status: "verified", expiresAt: new Date("2030-01-01T00:00:00Z"), consentedAt: new Date() });
    await store.sync();

    const consentUpsert = recorded.find((entry) => entry.table === "consent_receipts");
    expect(consentUpsert?.rows[0]).toMatchObject({ method: "email_plus", status: "verified" });
    expect(store.emailPlusVpcRequests.size).toBe(5);
    expect([...store.emailPlusVpcRequests.values()].map((r) => r.status)).toEqual([
      "requested", "link_sent", "confirmed", "revoked", "expired",
    ]);
  });
});

function createStubClient(
  tables: Record<string, Record<string, unknown>[]>,
  recorded: { table: string; rows: Record<string, unknown>[] }[],
): SupabaseClient {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      let single = false;
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return query; },
        in(_column: string, _values: unknown[]) { return query; },
        maybeSingle() { single = true; return query; },
        upsert(value: Record<string, unknown>[] | Record<string, unknown>) {
          recorded.push({ table, rows: Array.isArray(value) ? value : [value] });
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (error: unknown) => unknown) {
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
