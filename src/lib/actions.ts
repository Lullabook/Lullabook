"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Brief, TextStoryBrief, TraitQuestionnaire } from "@/domain/types";
import type { BlobStore, LivenessAdapter, WorkflowAdapter } from "@/adapters/types";
import type { ChildSafetyService } from "@/services/child-safety";
import type { MomentType } from "@/domain/daily-types";
import { castLimitError, castSlotInfo } from "@/lib/cast-limits";
import { requireAuthedContext } from "@/lib/auth";
import { createAuthClient } from "@/lib/supabase";
import {
  PersonaCreationOutboxDispatcher,
  PersonaCreationProtocol,
  SupabasePersonaCreationRepository,
  type FinalizedPersonaCreation,
  type PersonaCreationRepository,
  type PersonaCreationWorkerRepository,
} from "@/db/persona-creation-protocol";
import {
  ProductionPersonaCreationService,
  assertPersonaPhotoCount,
  personaCreationRequestFingerprint,
  type ProductionPersonaCreationInput,
} from "@/services/production-persona-creation";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Something went wrong",
  };
}

// Auth actions live in `@/lib/auth-actions` (plain form actions, no useActionState).

// ---------------------------------------------------------------------------
// Characters (text tier) + Text Stories
// ---------------------------------------------------------------------------

export async function createCharacterAction(
  questionnaire: TraitQuestionnaire,
  attestation?: string
): Promise<ActionResult<{ characterId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);
    if (!slots.canAdd) {
      return { ok: false, error: castLimitError(slots.subscribed) };
    }
    const character = await ctx.characters.create({
      memberId: member.id,
      questionnaire,
      attestation,
    });
    await ctx.persist();
    revalidatePath("/characters");
    return { ok: true, data: { characterId: character.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCharacterAction(
  characterId: string,
  questionnaire: TraitQuestionnaire
): Promise<ActionResult<{ characterId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const character = await ctx.characters.update({
      characterId,
      memberId: member.id,
      questionnaire,
    });
    await ctx.persist();
    revalidatePath("/characters");
    return { ok: true, data: { characterId: character.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCharacterAction(
  characterId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    await ctx.characters.delete({ characterId, memberId: member.id });
    await ctx.persist();
    revalidatePath("/characters");
    revalidatePath("/world");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function createTextStoryAction(
  brief: TextStoryBrief
): Promise<ActionResult<{ storyId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const story = await ctx.textStories.generate(member.id, brief);
    await ctx.persist();
    revalidatePath("/stories");
    return { ok: true, data: { storyId: story.id } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Dev-only demo injector (issue 47). Gated behind both `NODE_ENV` and an
 * explicit env flag so it can never run in production, and idempotent (bails
 * if the signed-in family already has storybooks). Populates the signed-in
 * family with the "Maya's World" demo dataset.
 */
export async function seedDemoWorldAction(): Promise<
  ActionResult<{ alreadySeeded: boolean; personas: number; characters: number; books: number }>
> {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_DEMO_SEED !== "true") {
    return { ok: false, error: "Demo seed is disabled" };
  }
  const { ctx, member } = await requireAuthedContext();
  try {
    const { seedMayaWorldRuntime } = await import("@/dev/seed-maya-world");
    const result = await seedMayaWorldRuntime(ctx, member);
    revalidatePath("/world");
    revalidatePath("/family");
    revalidatePath("/characters");
    revalidatePath("/stories");
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Personas (visual tier) — durable create
// ---------------------------------------------------------------------------

export async function runPersonaCreationActionBoundary(input: {
  creation: ProductionPersonaCreationInput;
  repository: PersonaCreationRepository;
  worker: PersonaCreationWorkerRepository;
  blobs: BlobStore;
  childSafety: ChildSafetyService;
  liveness: LivenessAdapter;
  workflow: WorkflowAdapter;
}): Promise<FinalizedPersonaCreation> {
  const protocol = new PersonaCreationProtocol(input.repository, input.blobs);
  const creation = new ProductionPersonaCreationService(input.childSafety, input.liveness, protocol);
  const finalized = await creation.create(input.creation);
  await new PersonaCreationOutboxDispatcher(input.worker, input.workflow)
    .dispatchReservation(finalized.id);
  return finalized;
}

/**
 * The authenticated request owns source bytes only in memory. PostgreSQL
 * reserves immutable family-scoped keys after source checks, then finalizes
 * the Persona graph and outbox before this action reports success.
 */
export async function createPersonaAction(
  formData: FormData
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    if (!ctx.subscriptions.isActive(member.familyId)) {
      return {
        ok: false,
        error:
          "Illustrated family members need a subscription. Add a character with a questionnaire instead — no photos required.",
      };
    }
    const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);
    if (!slots.canAdd) {
      return { ok: false, error: castLimitError(slots.subscribed) };
    }
    const mode = String(formData.get("mode") ?? "adult") as "adult" | "baby";
    const displayName = String(formData.get("displayName") ?? "").trim();
    const relationship = String(formData.get("relationship") ?? "").trim();
    const babyCallsThem = String(formData.get("babyCalls") ?? "").trim();
    const theyCallBaby = String(formData.get("theyCallBaby") ?? "").trim();
    if (!displayName) return { ok: false, error: "Name is required" };
    const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const selfie = formData.get("selfie");
    if (photos.length < 3) return { ok: false, error: "At least 3 photos required" };
    assertPersonaPhotoCount(photos.length);
    if (mode === "adult") {
      if (formData.get("selfConsent") !== "true") {
        return { ok: false, error: "Adult Personas require the subject's consent" };
      }
      if (!(selfie instanceof File)) {
        return { ok: false, error: "A selfie is required to verify your own likeness" };
      }
    }
    if (mode === "baby") {
      const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
      if (!gate.allowed) return { ok: false, error: gate.reason ?? "Not allowed" };
    }
    // UI checks are only UX. The server rejects an unentitled/non-Guardian
    // request before reading source bytes; the SQL reservation owns the
    // concurrency-safe three-Persona capacity decision.
    ctx.entitlements.requireCanCreate(
      member.familyId,
      member.id,
      mode === "adult" ? "adult-persona" : "baby-persona",
    );
    ctx.entitlements.requirePersonaSlot(member.familyId, member.id);

    const sourcePhotos = await Promise.all(
      photos.map(async (photo) => Buffer.from(await photo.arrayBuffer())),
    );
    const selfieBytes = selfie instanceof File ? Buffer.from(await selfie.arrayBuffer()) : undefined;
    const creationInput = {
      kind: mode,
      displayName,
      photoCount: sourcePhotos.length,
      photos: sourcePhotos,
      selfie: selfieBytes,
      ...(mode === "baby"
        ? {
            baby: { displayName },
            bond: { relationship, babyCallsThem, theyCallBaby },
          }
        : {}),
    };
    const authClient = await createAuthClient();
    const repository = new SupabasePersonaCreationRepository(authClient);
    await runPersonaCreationActionBoundary({
      creation: {
        ...creationInput,
        familyId: member.familyId,
        requestFingerprint: personaCreationRequestFingerprint(creationInput),
      },
      repository,
      worker: repository,
      blobs: ctx.blobs,
      childSafety: ctx.childSafety,
      liveness: ctx.liveness,
      workflow: ctx.workflow,
    });
    revalidatePath("/personas");
    revalidatePath("/family");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Character → Persona remains intentionally inert: Characters are fictional-only. */
export async function promoteCharacterAction(
  formData: FormData
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const characterId = String(formData.get("characterId") ?? "");
    const character = ctx.store.getCharacter(characterId, member.id);
    if (!character) return { ok: false, error: "Character not found" };

    // Reject before reading FormData files or touching BlobStore. Fictional
    // Characters cannot enter the real-person Persona creation protocol.
    await ctx.characters.promoteToPersona({
      characterId,
      memberId: member.id,
      kind: String(formData.get("kind") ?? "baby") as "baby" | "adult",
      photos: [],
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function acceptLikenessAction(
  personaId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.personas.acceptLikeness(personaId, member.id);
    try {
      await ctx.coldStart.onPersonaReady(personaId);
    } catch {
      // Resume failure is recoverable; the accepted Persona is durable and the
      // pending Brief remains retryable.
    }
    await ctx.persist();
    revalidatePath("/personas");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function replacePersonaPhotosAction(
  formData: FormData
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const personaId = String(formData.get("personaId") ?? "");
    const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const selfie = formData.get("selfie");
    if (photos.length < 3) {
      return { ok: false, error: "At least 3 photos required" };
    }
    const persona = ctx.store.getPersona(personaId, member.id);
    if (!persona) return { ok: false, error: "Persona not found" };
    if (persona.kind === "adult" && !(selfie instanceof File)) {
      return { ok: false, error: "A selfie is required to verify your own likeness" };
    }
    const buffers = await Promise.all(photos.map((f) => f.arrayBuffer().then((b) => Buffer.from(b))));
    const selfieBuf =
      persona.kind === "adult" && selfie instanceof File
        ? Buffer.from(await selfie.arrayBuffer())
        : undefined;
    await ctx.personas.replacePhotos({
      personaId,
      memberId: member.id,
      photos: buffers,
      selfie: selfieBuf,
    });
    await ctx.persist();
    revalidatePath("/family");
    revalidatePath("/world");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Storybooks
// ---------------------------------------------------------------------------

export async function generateStorybookAction(
  brief: Brief
): Promise<ActionResult<{ storybookId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const book = await ctx.storybooks.generate(member.id, brief);
    await ctx.persist();
    return { ok: true, data: { storybookId: book.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function generateFromClassicAction(
  classicId: string,
  brief: Brief
): Promise<ActionResult<{ storybookId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const book = await ctx.storybooks.generateFromClassic(member.id, classicId, brief);
    await ctx.persist();
    return { ok: true, data: { storybookId: book.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function submitBriefWhileTrainingAction(
  personaId: string,
  brief: Brief
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.coldStart.submitBriefWhileTraining(member.id, personaId, brief);
    await ctx.persist();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** System recovery of a failed/quarantined Page — free, never spends budget. */
export async function recoverPageAction(
  pageId: string,
  storybookId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.storybooks.recoverPage(member.id, pageId);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function rerollImageAction(
  pageId: string,
  storybookId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.storybooks.rerollImage(member.id, pageId);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function rerollTextAction(
  pageId: string,
  newText: string,
  storybookId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.storybooks.rerollText(member.id, pageId, newText);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function selectCandidateAction(
  candidateId: string,
  storybookId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    await ctx.storybooks.selectCandidate(member.id, candidateId);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function buyRerollCreditsAction(
  storybookId: string,
  credits: number
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.storybooks.buyRerollCredits(member.id, storybookId, credits);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function finalizeStorybookAction(
  storybookId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.storybooks.finalize(member.id, storybookId);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    revalidatePath("/library");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export async function mintShareLinkAction(
  storybookId: string,
  options: { expiresAt?: string; passcode?: string }
): Promise<ActionResult<{ url: string; warning: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const { url, warning } = ctx.sharing.mintShareLink(member.id, storybookId, {
      expiresAt: options.expiresAt ? new Date(options.expiresAt) : undefined,
      passcode: options.passcode || undefined,
    });
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: { url, warning } };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeShareLinkAction(
  linkId: string,
  storybookId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.sharing.revokeShareLink(member.id, linkId);
    await ctx.persist();
    revalidatePath(`/storybooks/${storybookId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export async function inviteMemberAction(
  formData: FormData
): Promise<ActionResult<{ inviteId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const email = String(formData.get("email") ?? "").trim();
    const { inviteId } = ctx.family.inviteMember(member.id, email);
    await ctx.persist();
    revalidatePath("/account");
    return { ok: true, data: { inviteId } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeMemberAction(
  targetMemberId: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.family.removeMember(member.id, targetMemberId);
    await ctx.persist();
    revalidatePath("/account");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Billing + consent
// ---------------------------------------------------------------------------

export async function startCheckoutAction(): Promise<ActionResult<never>> {
  const { ctx, member } = await requireAuthedContext();
  let url: string;
  try {
    const session = await ctx.subscriptions.startCheckout(member.familyId);
    await ctx.persist();
    url = session.url;
  } catch (err) {
    return fail(err);
  }
  redirect(url);
}

export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const sub = ctx.store.getSubscription(member.familyId);
    ctx.subscriptions.cancel(member.familyId);
    await ctx.persist();
    revalidatePath("/billing");
    // Cancel the Stripe side after our state is durable; webhook retries
    // make the reverse order risky.
    if (sub?.stripeSubscriptionId) {
      const { RealStripeAdapter } = await import("@/adapters/stripe");
      await new RealStripeAdapter().cancelSubscription(sub.stripeSubscriptionId);
    }
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function recordConsentAction(): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    // Issue 172: the web self-serve action can only attest payment_vpc — it
    // must never mint an email_plus/signed_form receipt without that flow.
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction, "payment_vpc");
    await ctx.persist();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// Void-returning wrappers for direct `<form action>` usage (React requires
// form actions to return void; the result-returning variants above are for
// client components that surface errors inline).

export async function inviteMemberFormAction(formData: FormData): Promise<void> {
  await inviteMemberAction(formData);
}

export async function removeMemberFormAction(
  targetMemberId: string,
  _formData: FormData
): Promise<void> {
  await removeMemberAction(targetMemberId);
}

export async function startCheckoutFormAction(): Promise<void> {
  await startCheckoutAction();
}

export async function cancelSubscriptionFormAction(): Promise<void> {
  await cancelSubscriptionAction();
}

// ---------------------------------------------------------------------------
// Moments / Daily Journal (issue 50)
// ---------------------------------------------------------------------------

export async function createMomentAction(input: {
  babyId: string;
  body: string;
  momentType: MomentType;
  occurredOn?: string;
  isSignificant?: boolean;
  linkedPersonaIds?: string[];
  linkedCharacterIds?: string[];
}): Promise<ActionResult<{ momentId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const moment = ctx.moments.create({
      memberId: member.id,
      babyId: input.babyId,
      body: input.body,
      momentType: input.momentType,
      occurredOn: input.occurredOn,
      isSignificant: input.isSignificant,
      linkedPersonaIds: input.linkedPersonaIds,
      linkedCharacterIds: input.linkedCharacterIds,
    });
    await ctx.persist();
    revalidatePath("/daily");
    revalidatePath("/world");
    return { ok: true, data: { momentId: moment.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateBabyDailyRoutineAction(
  babyId: string,
  routine: import("@/domain/daily-types").RoutineEntry[]
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    if (member.role !== "guardian") {
      return { ok: false, error: "Only guardians can edit the daily routine." };
    }
    for (const entry of routine) {
      if (!/^\d{2}:\d{2}$/.test(entry.time)) {
        return { ok: false, error: "Each time must be HH:MM (24-hour)." };
      }
      if (!entry.label.trim()) {
        return { ok: false, error: "Every routine step needs a label." };
      }
    }
    ctx.babies.updateBaby({
      memberId: member.id,
      babyId,
      dailyRoutine: routine.map((r) => ({
        time: r.time,
        icon: r.icon.trim() || "🕒",
        label: r.label.trim(),
      })),
    });
    await ctx.persist();
    revalidatePath("/daily");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function updateBabyBirthDateAction(formData: FormData): Promise<void> {
  const { ctx, member } = await requireAuthedContext();
  const babyId = String(formData.get("babyId") ?? "");
  const raw = String(formData.get("birthDate") ?? "").trim();
  ctx.babies.updateBaby({
    memberId: member.id,
    babyId,
    birthDate: raw || null,
  });
  await ctx.persist();
  revalidatePath("/account");
}

export async function dismissDailyNudgeAction(babyId: string): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.journalNudges.dismissDailyNudge(member.id, babyId);
    await ctx.persist();
    revalidatePath("/world");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function markWeeklySuggestionSeenAction(babyId: string): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    ctx.journalNudges.markWeeklySuggestionSeen(member.id, babyId);
    await ctx.persist();
    revalidatePath("/world");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Hard delete (ADR-0007) — destructive, Guardian-only, confirmed in the UI
// ---------------------------------------------------------------------------

export async function hardDeleteFamilyAction(
  confirmation: string
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  if (confirmation !== "DELETE") {
    return { ok: false, error: 'Type "DELETE" to confirm' };
  }
  try {
    await ctx.hardDelete.hardDelete(member.id);
    await ctx.persist();
  } catch (err) {
    return fail(err);
  }
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/goodbye");
}
