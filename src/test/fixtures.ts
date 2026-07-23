import {
  FakeAnthropic,
  FakeClassicCatalog,
  FakeFal,
  FakeLiveness,
  FakeModeration,
  FakeNotifications,
  FakePdf,
  FakeRevenueCat,
  FakeStripe,
  FakeVideo,
  FakeWorkflow,
  InMemoryBlobStore,
} from "@/adapters/fakes";
import type { FalAdapter } from "@/adapters/types";
import { DataStore } from "@/db/store";
import { BabyService } from "@/services/baby";
import { CharacterService } from "@/services/character";
import { ChildSafetyService } from "@/services/child-safety";
import { ColdStartService } from "@/services/cold-start";
import { ExportService } from "@/services/export";
import { FamilyRosterService } from "@/services/family-roster";
import { FamilyService } from "@/services/family";
import { HardDeleteService } from "@/services/hard-delete";
import { OnboardingService } from "@/services/onboarding";
import { PersonaService } from "@/services/persona";
import { SharingService } from "@/services/sharing";
import { StorybookService } from "@/services/storybook";
import { SubscriptionService } from "@/services/subscription";
import { TextStoryService } from "@/services/text-story";
import { VoiceClipService } from "@/services/voice-clip";
import { MomentService } from "@/services/moment";
import { JournalNudgeService } from "@/services/journal-nudge";
import { PastStorySummaryService } from "@/services/past-story-summary";
import { EntitlementService } from "@/services/entitlement";
import { RevenueCatPurchaseService } from "@/services/revenuecat-purchase";
import { StoryCapService } from "@/services/story-cap";
import { CreditLedgerService } from "@/services/credit-ledger";
import { CustomStyleService } from "@/services/custom-style";
import { HomeDashboardService } from "@/services/home-dashboard";
import { WorldService } from "@/services/world";

export function createTestContext<T extends FalAdapter = FakeFal>(options?: {
  fal?: T;
}) {
  const store = new DataStore();
  const anthropic = new FakeAnthropic();
  const classicCatalog = new FakeClassicCatalog();
  // Issue 123: an explicit fal override (e.g. DevFalFallbackAdapter) wires
  // through personas + storybooks so the dev placeholder path is testable
  // end-to-end without touching the production composition root. The default
  // generic stays FakeFal so existing tests keep access to its inspector props.
  const fal = (options?.fal ?? new FakeFal()) as T;
  const video = new FakeVideo();
  const moderation = new FakeModeration();
  const liveness = new FakeLiveness();
  const blobs = new InMemoryBlobStore();
  const workflow = new FakeWorkflow();
  const notifications = new FakeNotifications();
  const stripe = new FakeStripe();
  const pdf = new FakePdf();
  const revenuecat = new FakeRevenueCat();

  const childSafety = new ChildSafetyService(store, moderation);
  const subscriptions = new SubscriptionService(store, stripe);
  const entitlements = new EntitlementService(store, subscriptions);
  const revenuecatPurchases = new RevenueCatPurchaseService(store, subscriptions, revenuecat, entitlements);
  const storyCap = new StoryCapService(store, entitlements);
  const credits = new CreditLedgerService(store, entitlements);
  const customStyles = new CustomStyleService(store, fal, workflow, blobs, entitlements, credits);
  const personas = new PersonaService(
    store,
    fal,
    liveness,
    moderation,
    blobs,
    workflow,
    notifications,
    subscriptions,
    childSafety,
    entitlements
  );
  // Issue 125: wrap the persona service so `createBaby`/`createAdult`/photo
  // replacement auto-confirm likeness for the test harness — every "ready"
  // persona is immediately usable by tests that call `ctx.storybooks.generate`
  // directly. The gate itself is real (enforced in storybook.ts) and is
  // exercised explicitly in tests/125-likeness-gate.test.ts by calling
  // `generate` on a persona whose likeness was never accepted.
  const personasProxy = new Proxy(personas, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== "createBaby" && prop !== "createAdult" && prop !== "replacePhotos") {
        return value;
      }
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const persona = await value.apply(target, args);
        if (persona?.id && persona.status === "ready") {
          // Issue 125: only a Guardian may confirm likeness (persona service
          // enforces role). Auto-accept only when the creator is a guardian;
          // non-guardian creators (e.g. an invited Member making their own
          // Adult Persona) must have their Guardian confirm separately.
          const creator = store.members.get(persona.createdByMemberId);
          if (creator?.role === "guardian") {
            target.acceptLikeness(persona.id, persona.createdByMemberId);
          }
        }
        return persona;
      };
    },
  });
  const characters = new CharacterService(store, anthropic, childSafety);
  const babies = new BabyService(store);
  const familyRoster = new FamilyRosterService(store);
  const voiceClips = new VoiceClipService(store, blobs, entitlements, undefined, notifications);
  const moments = new MomentService(store);
  const journalNudges = new JournalNudgeService(store, moments);
  const pastStorySummary = new PastStorySummaryService(store);
  const world = new WorldService(store, babies, familyRoster);
  const storybooks = new StorybookService(
    store,
    anthropic,
    fal,
    childSafety,
    blobs,
    workflow,
    subscriptions,
    classicCatalog,
    false,
    video,
    null,
    pastStorySummary,
    entitlements
  );
  const multiStorybooks = new StorybookService(
    store,
    anthropic,
    fal,
    childSafety,
    blobs,
    workflow,
    subscriptions,
    classicCatalog,
    true,
    video,
    null,
    pastStorySummary,
    entitlements
  );
  const sharing = new SharingService(store);
  const family = new FamilyService(store, notifications);
  const hardDelete = new HardDeleteService(store, blobs, notifications);
  const exportSvc = new ExportService(store, pdf);
  const coldStart = new ColdStartService(store, storybooks);
  const onboarding = new OnboardingService(store);
  const textStories = new TextStoryService(store, anthropic, childSafety);
  const homeDashboard = new HomeDashboardService(store, moments, storybooks);

  return {
    store,
    anthropic,
    classicCatalog,
    fal,
    video,
    moderation,
    liveness,
    blobs,
    workflow,
    notifications,
    stripe,
    pdf,
    revenuecat,
    childSafety,
    subscriptions,
    characters,
    personas: personasProxy,
    /** Issue 125: the unwrapped PersonaService — use to create un-confirmed personas for gate tests. */
    rawPersonas: personas,
    babies,
    familyRoster,
    voiceClips,
    moments,
    journalNudges,
    pastStorySummary,
    entitlements,
    revenuecatPurchases,
    storyCap,
    credits,
    customStyles,
    homeDashboard,
    world,
    storybooks,
    multiStorybooks,
    sharing,
    family,
    hardDelete,
    exportSvc,
    coldStart,
    onboarding,
    textStories,
    async persist(): Promise<void> {
      await workflow.flush();
    },
  };
}

export function withActiveSubscription(
  ctx: ReturnType<typeof createTestContext>,
  member: { familyId: string; id: string }
) {
  ctx.subscriptions.handleCheckoutCompleted(member.familyId, `cus_${member.id}`, `sub_${member.id}`);
}

export async function generateAndWait(
  ctx: ReturnType<typeof createTestContext>,
  memberId: string,
  brief: import("@/domain/types").Brief
) {
  // Issue 125: auto-accept likeness on every starring persona so the wider
  // suite is unaffected by the likeness-confirmation gate. Tests that exercise
  // the gate directly call `ctx.storybooks.generate` instead. Mirror
  // `normalizeBrief`: a ready Baby Persona for the family is auto-inserted, so
  // accept it too even when the brief lists no personas.
  const member = ctx.store.members.get(memberId);
  const babyPersona = member
    ? [...ctx.store.personas.values()].find(
        (p) => p.familyId === member.familyId && p.kind === "baby" && p.status === "ready"
      )
    : undefined;
  const starring = [...brief.starringPersonaIds];
  if (babyPersona && !starring.includes(babyPersona.id)) {
    starring.unshift(babyPersona.id);
  }
  for (const pid of starring) {
    const p = ctx.store.getPersona(pid, memberId);
    if (p && p.status === "ready" && p.likenessConfirmed !== true) {
      // Issue 125: auto-accept likeness for the test harness. Only a Guardian
      // may confirm; a non-Guardian member generating from an already-confirmed
      // persona is fine, but a non-guardian can't be the confirmer — skip those
      // (the persona's guardian creator confirms via the personasProxy).
      const actor = ctx.store.members.get(memberId);
      if (actor?.role === "guardian") {
        ctx.personas.acceptLikeness(pid, memberId);
      }
    }
  }
  const book = await ctx.storybooks.generate(memberId, brief);
  await ctx.workflow.drain();
  return ctx.store.getStorybook(book.id, memberId)!;
}

export function goodPhoto(seed = 0xaa): Buffer {
  const buf = Buffer.alloc(20_000);
  buf[0] = seed;
  buf[1] = 0x01;
  buf[2] = 0x00;
  return buf;
}

/** Guardian with subscription + consent, ready for baby/adult persona creation. */
export async function subscribedGuardian(ctx: ReturnType<typeof createTestContext>) {
  const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian", "g@example.com");
  withActiveSubscription(ctx, guardian);
  ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
  return guardian;
}

/** Full household setup: guardian, baby persona, default Baby record. */
export async function householdWithBaby(ctx: ReturnType<typeof createTestContext>, name = "Maya") {
  const guardian = await subscribedGuardian(ctx);
  const babyPersona = await ctx.personas.createBaby({
    memberId: guardian.id,
    displayName: name,
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
  });
  const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: name });
  return { guardian, babyPersona, baby };
}

/**
 * Issue 125 — a household whose baby persona is NOT likeness-confirmed, for
 * gate tests. Uses `rawPersonas` to bypass the test-harness auto-accept.
 */
export async function householdWithBabyUnconfirmed(
  ctx: ReturnType<typeof createTestContext>,
  name = "Maya"
) {
  const guardian = await subscribedGuardian(ctx);
  const babyPersona = await ctx.rawPersonas.createBaby({
    memberId: guardian.id,
    displayName: name,
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
  });
  const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: name });
  return { guardian, babyPersona, baby };
}

export async function createReadyAdult(
  ctx: ReturnType<typeof createTestContext>,
  guardian: { id: string },
  displayName = "Adult"
) {
  ctx.liveness.shouldMatch = true;
  return ctx.personas.createAdult({
    memberId: guardian.id,
    displayName,
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
}

// ---------------------------------------------------------------------------
// "Maya's World" demo seed (issue 47 / PRD v5)
// ---------------------------------------------------------------------------

interface SeedAdultSpec {
  displayName: string;
  relationship: string;
  babyCallsThem: string;
  theyCallBaby: string;
  /** Final display status after the books are generated. */
  finalStatus: "ready" | "training" | "needs-photos";
  voiceClips: { label: string; transcript: string; durationSecs: number }[];
}

const MAYA_ADULTS: SeedAdultSpec[] = [
  {
    displayName: "Priya",
    relationship: "Mom",
    babyCallsThem: "Mama",
    theyCallBaby: "my little star",
    finalStatus: "ready",
    voiceClips: [
      { label: "Goodnight, my star", transcript: "Goodnight, my little star.", durationSecs: 4 },
      { label: "I love you to the moon", transcript: "I love you to the moon and back.", durationSecs: 5 },
    ],
  },
  {
    displayName: "Sam",
    relationship: "Dad",
    babyCallsThem: "Dada",
    theyCallBaby: "peanut",
    finalStatus: "ready",
    voiceClips: [{ label: "Sweet dreams, peanut", transcript: "Sweet dreams, peanut.", durationSecs: 3 }],
  },
  {
    displayName: "Grandma Rose",
    relationship: "Grandmother",
    babyCallsThem: "Nani",
    theyCallBaby: "moonbeam",
    finalStatus: "ready",
    voiceClips: [
      { label: "Twinkle twinkle", transcript: "Twinkle, twinkle, little moonbeam.", durationSecs: 6 },
      { label: "Once upon a time", transcript: "Once upon a time, in Nani's garden…", durationSecs: 5 },
    ],
  },
  {
    displayName: "Ava",
    relationship: "Big sister",
    babyCallsThem: "Sissy",
    theyCallBaby: "baby sis",
    finalStatus: "training",
    voiceClips: [{ label: "Night night, baby sis", transcript: "Night night, baby sis!", durationSecs: 3 }],
  },
  {
    displayName: "Uncle Leo",
    relationship: "Uncle",
    babyCallsThem: "Uncle Lee",
    theyCallBaby: "little buddy",
    finalStatus: "needs-photos",
    voiceClips: [],
  },
];

const MAYA_CHARACTERS: { name: string; topics: string[]; favoriteAnimals?: string[] }[] = [
  { name: "Coco the Cat", topics: ["Curious", "Cuddly"], favoriteAnimals: ["cats"] },
  { name: "Pip the Dragon", topics: ["Brave", "Silly"], favoriteAnimals: ["dragons"] },
  { name: "Mr. Moon", topics: ["Wise", "Gentle"] },
  { name: "Bramble Bear", topics: ["Kind", "Strong"], favoriteAnimals: ["bears"] },
];

export interface SeededMayaWorld {
  baby: import("@/domain/types").Baby;
  babyPersona: import("@/domain/types").Persona;
  personas: import("@/domain/types").Persona[];
  characters: import("@/domain/types").Character[];
  books: import("@/domain/types").Storybook[];
}

/**
 * Build the "Maya's World" demo dataset for an existing guardian Member, all
 * writes routed through the family-scoped services (RLS-safe). Used by tests
 * and mirrored by the dev runtime seed. Idempotency is the caller's concern.
 */
export async function seedMayaWorld(
  ctx: ReturnType<typeof createTestContext>,
  memberId: string
): Promise<SeededMayaWorld> {
  const member = ctx.store.members.get(memberId);
  if (!member) throw new Error("Member not found");

  // Subscription + consent so Baby Persona + illustrated generation are allowed.
  // Set tier to Plus so the 5-adult roster fits within the member cap (issue 93).
  if (!ctx.subscriptions.isActive(member.familyId)) {
    withActiveSubscription(ctx, member);
  }
  const sub = ctx.store.getSubscription(member.familyId);
  if (sub) {
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });
  }
  ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction);

  const babyPersona = await ctx.personas.createBaby({
    memberId,
    displayName: "Maya",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
  });
  const baby = ctx.babies.addBaby({ memberId, displayName: "Maya" });

  // All adults created ready first so storybook generation can star any of
  // them; statuses are downgraded for display variety afterwards.
  const personaByName = new Map<string, import("@/domain/types").Persona>();
  for (const spec of MAYA_ADULTS) {
    const persona = await createReadyAdult(ctx, { id: memberId }, spec.displayName);
    personaByName.set(spec.displayName, persona);
    ctx.familyRoster.updateBond({
      memberId,
      babyId: baby.id,
      personaId: persona.id,
      relationship: spec.relationship,
      babyCallsThem: spec.babyCallsThem,
      theyCallBaby: spec.theyCallBaby,
    });
    for (const clip of spec.voiceClips) {
      ctx.voiceClips.recordConsent(memberId, persona.id);
      await ctx.voiceClips.uploadClip({
        memberId,
        personaId: persona.id,
        label: clip.label,
        transcript: clip.transcript,
        durationSecs: clip.durationSecs,
        audioBytes: Buffer.from(`${spec.displayName}-${clip.label}`),
      });
    }
  }

  const characterByName = new Map<string, import("@/domain/types").Character>();
  for (const spec of MAYA_CHARACTERS) {
    const character = await ctx.characters.create({
      memberId,
      questionnaire: {
        name: spec.name,
        topics: spec.topics,
        favoriteAnimals: spec.favoriteAnimals,
        isFictional: true,
      },
    });
    characterByName.set(spec.name, character);
  }

  const p = (name: string) => personaByName.get(name)!.id;
  const c = (name: string) => characterByName.get(name)!.id;

  // Generated while every adult is still ready. Status changes below do not
  // rewrite already-captured briefs.
  const finalizedAndDrafts: { theme: string; storyType: import("@/domain/types").StoryType; personas: string[]; characters?: string[]; finalize: boolean }[] = [
    { theme: "A Morning in Nani's Garden", storyType: "everyday", personas: [p("Grandma Rose")], finalize: true },
    { theme: "Maya's Very First Snow", storyType: "milestone", personas: [p("Sam")], finalize: true },
    { theme: "Maya's Big Beach Day", storyType: "adventure", personas: [p("Priya"), p("Sam")], finalize: false },
    { theme: "The Day Dada Was a Dragon", storyType: "silly", personas: [p("Sam")], characters: [c("Pip the Dragon")], finalize: true },
    { theme: "Maya & the Brave Bunnies", storyType: "lesson", personas: [p("Ava")], finalize: true },
  ];

  const books: import("@/domain/types").Storybook[] = [];
  for (const spec of finalizedAndDrafts) {
    const book = await generateAndWait(ctx, memberId, {
      starringPersonaIds: spec.personas,
      starringCharacterIds: spec.characters,
      babyId: baby.id,
      storyType: spec.storyType,
      theme: spec.theme,
    });
    if (spec.finalize) {
      ctx.storybooks.finalize(memberId, book.id);
    }
    books.push(ctx.store.getStorybook(book.id, memberId)!);
  }

  // Generating book created LAST and left undrained so it stays "generating".
  const generating = await ctx.storybooks.generate(memberId, {
    starringPersonaIds: [p("Grandma Rose")],
    babyId: baby.id,
    storyType: "learning",
    theme: "Counting Stars with Nani",
  });
  books.push(ctx.store.getStorybook(generating.id, memberId)!);

  // Downgrade statuses for display variety (Ava training, Leo needs photos).
  for (const spec of MAYA_ADULTS) {
    if (spec.finalStatus === "ready") continue;
    const persona = personaByName.get(spec.displayName)!;
    persona.status = spec.finalStatus === "training" ? "training" : "failed";
    ctx.store.savePersona(persona);
  }

  return {
    baby,
    babyPersona,
    personas: MAYA_ADULTS.map((s) => personaByName.get(s.displayName)!),
    characters: MAYA_CHARACTERS.map((s) => characterByName.get(s.name)!),
    books,
  };
}
