import { getApiUrl } from "@/lib/env";
import { getAccessToken } from "@/lib/supabase";
import type { Character, Persona } from "@domain/types";

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
