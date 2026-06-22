import { getApiUrl } from "@/lib/env";
import { getAccessToken } from "@/lib/supabase";
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
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function apiFormData<T>(path: string, body: FormData): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (!res.ok) {
    const responseBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(responseBody.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
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

export async function illustrationSource(blobKey: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  const token = await getAccessToken();
  return {
    uri: `${apiBase}/api/images?key=${encodeURIComponent(blobKey)}`,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}
