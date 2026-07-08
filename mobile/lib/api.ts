import { getApiUrl } from "@/lib/env";
import { getAccessToken } from "@/lib/supabase";
import { classifyEntitlementError } from "@/lib/entitlement-error";
import type { Character, Persona, StoryType } from "@domain/types";

const apiBase = getApiUrl();

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    // Issue 171 (SEC-1): a 403 carrying a known entitlement code is the
    // server's paywall boundary — surface it typed so callers route to
    // billing.tsx. Non-entitlement 403s stay plain errors (never hijacked).
    const entitlementErr = classifyEntitlementError(res.status, body);
    if (entitlementErr) throw entitlementErr;
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiFormData<T>(path: string, body: FormData): Promise<T> {
  const token = await getAccessToken();
  return new Promise<T>((resolve, reject) => {
    // Issue 163: Expo SDK 56's "winter" fetch polyfill throws
    // "Unsupported FormDataPart implementation" on RN's native {uri,name,type}
    // FormData file parts. The RN-native XMLHttpRequest streams {uri} parts
    // from disk natively (no base64 in memory — I1.3: ≤10 images, streamed),
    // so we use XHR directly for multipart uploads, bypassing the winter fetch.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 120_000; // generous; uploads of ≤10 photos are I1.3-streamed.
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      // Red-team EDGE-1: status === 0 means the request never reached the
      // server (network failure). The XHR spec fires onreadystatechange(4, 0)
      // BEFORE onerror — if we reject here, the `settled` guard swallows the
      // more helpful onerror message. Defer to onerror/ontimeout instead.
      if (xhr.status === 0) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        done(() => {
          try {
            resolve(JSON.parse(xhr.responseText) as T);
          } catch {
            reject(new Error("The server returned an unexpected response — please try again"));
          }
        });
      } else {
        done(() => {
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        });
      }
    };
    xhr.onerror = () =>
      done(() => reject(new Error("Network error during upload — please check your connection and try again")));
    xhr.ontimeout = () =>
      done(() => reject(new Error("The upload timed out — please try again")));
    xhr.send(body);
  });
}

export interface HomeResponse {
  member: {
    id: string;
    email: string;
    role: string;
    jurisdiction: string;
  };
  selectedBaby: { id: string; displayName: string } | null;
  personas: Persona[];
  characters: Character[];
  subscriptionActive: boolean;
  hasConsentReceipt: boolean;
  trainingExpectationCopy: string;
}

export function fetchHome(): Promise<HomeResponse> {
  return apiFetch("/api/home");
}

/** Issue 129 — server-side paywall config (R1 one-plan collapse is server-driven). */
export interface PaywallPlanResponse {
  id: string;
  label: string;
  monthlyPrice: number;
  annualPrice: number;
  storyCap: number;
  memberLoginCap: number;
  canNarrate: boolean;
  canVideo: boolean;
  canCustomStyle: boolean;
  isRecommended?: boolean;
  valueProp: string;
}

export interface PaywallConfigResponse {
  plans: PaywallPlanResponse[];
  annualDefault: boolean;
}

export function fetchPaywallConfig(): Promise<PaywallConfigResponse> {
  return apiFetch("/api/paywall-config");
}

/** Issue 125 — confirm likeness on a trained Persona (mobile route). */
export function acceptLikeness(personaId: string): Promise<{ ok: boolean; personaId: string }> {
  return apiFetch(`/api/personas/${encodeURIComponent(personaId)}/accept-likeness`, {
    method: "POST",
  });
}

export function createCharacter(body: {
  questionnaire: import("@domain/types").TraitQuestionnaire;
  attestation?: string;
}): Promise<{ characterId: string }> {
  return apiFetch("/api/characters", { method: "POST", body: JSON.stringify(body) });
}

export function fetchCharacter(id: string): Promise<{ character: Character & { createdAt: string } }> {
  return apiFetch(`/api/characters/${encodeURIComponent(id)}`);
}

export function updateCharacter(
  id: string,
  questionnaire: import("@domain/types").TraitQuestionnaire
): Promise<{ characterId: string }> {
  return apiFetch(`/api/characters/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ questionnaire }),
  });
}

export function createPersona(formData: FormData): Promise<{ queued: boolean }> {
  return apiFormData("/api/personas", formData);
}

export function createTextStory(
  brief: import("@domain/types").TextStoryBrief
): Promise<{ storyId: string; text: string }> {
  return apiFetch("/api/text-stories", { method: "POST", body: JSON.stringify(brief) });
}

export function registerPushToken(expoPushToken: string): Promise<{ id: string }> {
  return apiFetch("/api/push/register", {
    method: "POST",
    body: JSON.stringify({ expoPushToken }),
  });
}

export function hardDeleteAccount(): Promise<{ deleted: boolean }> {
  return apiFetch("/api/account/hard-delete", {
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE" }),
  });
}

/** Issue 107: dev-only demo seed (double-gated server-side). */
export function seedDemo(): Promise<{
  alreadySeeded: boolean;
  personas: number;
  characters: number;
  books: number;
}> {
  return apiFetch("/api/dev/seed", { method: "POST" });
}

export interface MomentWire {
  id: string;
  familyId: string;
  babyId: string;
  createdByMemberId: string;
  body: string;
  occurredOn: string;
  isSignificant: boolean;
  momentType: import("@domain/daily-types").MomentType;
  createdAt: string;
}

export function createMoment(input: {
  babyId: string;
  body: string;
  momentType: import("@domain/daily-types").MomentType;
  occurredOn?: string;
  significant?: boolean;
  linkedPersonaIds?: string[];
  linkedCharacterIds?: string[];
}): Promise<{ moment: MomentWire }> {
  return apiFetch("/api/moments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMoments(babyId: string): Promise<{ moments: MomentWire[] }> {
  return apiFetch(`/api/moments?babyId=${encodeURIComponent(babyId)}`);
}

export interface StorybookSummary {
  id: string;
  familyId: string;
  babyId?: string;
  status: import("@domain/types").StorybookStatus;
  theme: string;
  storyType: StoryType;
  createdAt: string;
  finalizedAt: string | null;
}

export function createStorybook(brief: import("@domain/types").Brief): Promise<{
  storybookId: string;
  status: string;
}> {
  return apiFetch("/api/storybooks", { method: "POST", body: JSON.stringify(brief) });
}

export function listStorybooks(babyId?: string): Promise<{ storybooks: StorybookSummary[] }> {
  const q = babyId ? `?babyId=${encodeURIComponent(babyId)}` : "";
  return apiFetch(`/api/storybooks${q}`);
}

export interface StorybookPageWire {
  id: string;
  index: number;
  text: string;
  generationStatus: import("@domain/types").PageGenerationStatus;
  illustrationBlobKey: string | null;
  hasIllustration: boolean;
  voiceClipId: string | null;
  candidates: { id: string; kind: string; content: string; selected: boolean }[];
}

export interface StorybookDetailWire {
  id: string;
  status: import("@domain/types").StorybookStatus;
  theme: string;
  storyType: StoryType;
  rerollBudgetRemaining: number;
  rerollCredits: number;
  pages: StorybookPageWire[];
}

export function getStorybook(id: string): Promise<StorybookDetailWire> {
  return apiFetch(`/api/storybooks/${encodeURIComponent(id)}`);
}

/**
 * Issue 160 (PRD v18) — finalize a draft Storybook. One-way: locks re-rolls.
 * Callers must refetch the book afterwards (E4) — the server is the only
 * authority on status.
 */
export function finalizeStorybook(id: string): Promise<{ finalized: boolean; status: string }> {
  return apiFetch(`/api/storybooks/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Issue 161 (PRD v18) — download a finalized Storybook's PDF keepsake into the
 * app cache sandbox and return the cached file's uri for the share sheet.
 *
 *   E1: the download aborts at 45s — the caller never freezes on a dead wait.
 *   E2: the body is validated as a real PDF (%PDF magic) before anything is
 *       kept; any failure deletes the file and rethrows a retryable error.
 *   E3: the fetch carries the same bearer mechanism as every other call; the
 *       file only ever lands in `Paths.cache` (app sandbox) — egress happens
 *       solely via the user-initiated share sheet in the caller.
 */
export async function downloadStorybookPdf(id: string): Promise<string> {
  // SDK 56 expo-file-system (File/Paths API) is native-only — no web
  // implementation. Lazy-load it so importing this module never breaks the
  // expo-web preview bundle; the export button itself is hidden on web (E6).
  const { File, Paths } = await import("expo-file-system");
  const file = new File(Paths.cache, `lullabook-${id}.pdf`);
  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${apiBase}/api/storybooks/${encodeURIComponent(id)}/export`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Export failed (${res.status})`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPdf =
      bytes.length > 4 &&
      bytes[0] === 0x25 && // %
      bytes[1] === 0x50 && // P
      bytes[2] === 0x44 && // D
      bytes[3] === 0x46; // F
    if (!isPdf) {
      throw new Error("The export didn't come back as a PDF — please try again");
    }
    if (file.exists) file.delete(); // replace any stale keepsake atomically-ish
    file.write(bytes);
    return file.uri;
  } catch (err) {
    // E2: never leave a partial or non-PDF file behind on any failure.
    try {
      if (file.exists) file.delete();
    } catch {
      // best-effort cleanup — the throw below is what the UI acts on
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The export took too long — please try again");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function rerollPageImage(pageId: string): Promise<{ rerolled: boolean }> {
  return apiFetch(`/api/storybooks/pages/${encodeURIComponent(pageId)}/reroll-image`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function selectPageCandidate(candidateId: string): Promise<{ selected: boolean }> {
  return apiFetch(`/api/storybooks/candidates/${encodeURIComponent(candidateId)}/select`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Issue 109/111 — Family invites
export function sendInvite(email: string): Promise<{ inviteId: string; token: string }> {
  return apiFetch("/api/family/invite", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function acceptInvite(token: string): Promise<{ memberId: string; familyId: string }> {
  return apiFetch("/api/family/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// Issue 112/113 — Voice clips
export function uploadVoiceClip(input: {
  personaId: string;
  label: string;
  transcript: string;
  durationSecs: number;
  audioBytes: string; // base64
}): Promise<{ clip: { id: string; label: string; transcript: string; durationSecs: number } }> {
  return apiFetch("/api/voice/clip", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listVoiceClips(personaId: string): Promise<{
  clips: { id: string; label: string; transcript: string; durationSecs: number }[];
}> {
  return apiFetch(`/api/voice/list?personaId=${encodeURIComponent(personaId)}`);
}

export function getVoicePlaybackUrl(clipId: string): Promise<{ url: string }> {
  return apiFetch(`/api/voice/playback?clipId=${encodeURIComponent(clipId)}`);
}

export function revokeVoiceConsent(personaId: string): Promise<{ revoked: boolean }> {
  return apiFetch("/api/voice/revoke", {
    method: "POST",
    body: JSON.stringify({ personaId }),
  });
}

// Issue 170 (ADR-0027) — PurchaseController wire calls. The seam itself is
// mobile/lib/purchase-controller.ts (pure DI); mobile/lib/purchases.ts binds
// these two functions into it. Both hit real, server-authoritative routes.

/** Prod-guarded fake-trial start — POST /api/billing/start-trial (issue 168). */
export function startTrialRequest(): Promise<
  import("@/lib/purchase-controller").StartTrialWire
> {
  return apiFetch("/api/billing/start-trial", { method: "POST", body: JSON.stringify({}) });
}

/** SEC-1 refetch — GET /api/entitlement is the only entitlement authority. */
export function fetchEntitlementSnapshot(): Promise<
  import("@/lib/purchase-controller").EntitlementSnapshot
> {
  return apiFetch("/api/entitlement");
}

export async function illustrationSource(blobKey: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  const token = await getAccessToken();
  return {
    uri: `${apiBase}/api/images?key=${encodeURIComponent(blobKey)}`,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}
