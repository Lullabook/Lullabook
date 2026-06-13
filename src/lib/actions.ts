"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EVENTS, inngest } from "@/adapters/inngest";
import type { Brief, TextStoryBrief, TraitQuestionnaire } from "@/domain/types";
import { requireAuthedContext } from "@/lib/auth";
import { createAuthClient } from "@/lib/supabase";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Something went wrong",
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signUpAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    options: {
      data: { jurisdiction: String(formData.get("jurisdiction") ?? "US") },
    },
  });
  if (error) return { ok: false, error: error.message };
  redirect("/library");
}

export async function signInAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { ok: false, error: error.message };
  redirect("/library");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

// ---------------------------------------------------------------------------
// Characters (text tier) + Text Stories
// ---------------------------------------------------------------------------

export async function createCharacterAction(
  questionnaire: TraitQuestionnaire,
  attestation?: string
): Promise<ActionResult<{ characterId: string }>> {
  const { ctx, member } = await requireAuthedContext();
  try {
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

// ---------------------------------------------------------------------------
// Personas (visual tier) — staged upload + durable create
// ---------------------------------------------------------------------------

async function stagePersonaUploads(
  ctx: Awaited<ReturnType<typeof requireAuthedContext>>["ctx"],
  familyId: string,
  photos: File[],
  selfie: File | null
): Promise<{ photoKeys: string[]; selfieKey?: string }> {
  const stagingId = randomUUID();
  const photoKeys: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const key = `staging/${familyId}/${stagingId}/photo-${i}.jpg`;
    await ctx.blobs.put(key, Buffer.from(await photos[i].arrayBuffer()));
    photoKeys.push(key);
  }
  let selfieKey: string | undefined;
  if (selfie) {
    selfieKey = `staging/${familyId}/${stagingId}/selfie.jpg`;
    await ctx.blobs.put(selfieKey, Buffer.from(await selfie.arrayBuffer()));
  }
  return { photoKeys, selfieKey };
}

/**
 * Thin request: stage the photo bytes, emit the durable persona-create
 * event, return immediately. Training progress arrives by notification and
 * roster polling — the long fal training run never blocks a request.
 */
export async function createPersonaAction(
  formData: FormData
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const mode = String(formData.get("mode") ?? "adult") as "adult" | "baby";
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (!displayName) return { ok: false, error: "Name is required" };
    const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const selfie = formData.get("selfie");
    if (photos.length < 3) {
      return { ok: false, error: "At least 3 photos required" };
    }
    if (mode === "adult" && !(selfie instanceof File)) {
      return { ok: false, error: "A selfie is required to verify your own likeness" };
    }
    if (mode === "baby") {
      const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
      if (!gate.allowed) return { ok: false, error: gate.reason ?? "Not allowed" };
    }

    const { photoKeys, selfieKey } = await stagePersonaUploads(
      ctx,
      member.familyId,
      photos,
      mode === "adult" && selfie instanceof File ? selfie : null
    );
    await inngest.send({
      name: EVENTS.personaCreateRequested,
      data: { mode, memberId: member.id, displayName, photoKeys, selfieKey },
    });
    revalidatePath("/personas");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Character → Persona upgrade: same staged-upload flow, full consent tier. */
export async function promoteCharacterAction(
  formData: FormData
): Promise<ActionResult> {
  const { ctx, member } = await requireAuthedContext();
  try {
    const characterId = String(formData.get("characterId") ?? "");
    const character = ctx.store.getCharacter(characterId, member.id);
    if (!character) return { ok: false, error: "Character not found" };
    const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const selfie = formData.get("selfie");
    if (photos.length < 3) {
      return { ok: false, error: "At least 3 photos required" };
    }

    const { photoKeys, selfieKey } = await stagePersonaUploads(
      ctx,
      member.familyId,
      photos,
      selfie instanceof File ? selfie : null
    );
    await inngest.send({
      name: EVENTS.personaCreateRequested,
      data: {
        mode: "promote-character",
        memberId: member.id,
        displayName: character.displayName,
        characterId,
        kind: String(formData.get("kind") ?? "baby") as "baby" | "adult",
        photoKeys,
        selfieKey,
      },
    });
    revalidatePath("/personas");
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
    await ctx.persist();
    revalidatePath("/personas");
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
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction);
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
