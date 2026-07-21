import type { Persona, PersonaStatus } from "@/domain/types";

/**
 * Family-scoped blob key for the generated roster portrait (ADR-0020).
 * `generationId` distinguishes retrained
 * derivatives: reusing one deterministic key would let caches/CDNs serve the
 * pre-retrain avatar bytes after the parent rejected that likeness. Callers
 * that omit it (legacy/dev seeds) keep the stable key.
 */
export function rosterAvatarBlobKey(
  familyId: string,
  personaId: string,
  generationId?: string
): string {
  return generationId
    ? `avatars/${familyId}/${personaId}/${generationId}.png`
    : `avatars/${familyId}/${personaId}.png`;
}

/** Authenticated web path that resolves a roster avatar for `<img src>`. */
export function rosterAvatarServePath(avatarKey: string): string {
  return `/api/avatars?key=${encodeURIComponent(avatarKey)}`;
}

export function isRosterAvatarKey(key: string, familyId: string): boolean {
  return key.startsWith(`avatars/${familyId}/`);
}

export function shouldShowRosterAvatar(
  status: PersonaStatus,
  avatarKey: string | null | undefined
): avatarKey is string {
  return status === "ready" && !!avatarKey;
}

export function rosterAvatarFromPersona(persona: Persona): string | null {
  return shouldShowRosterAvatar(persona.status, persona.avatarKey)
    ? rosterAvatarServePath(persona.avatarKey)
    : null;
}

/** Family-scoped blob key for one generated likeness-review sample. */
export function likenessReviewSampleBlobKey(
  familyId: string,
  personaId: string,
  generationId: string,
  index: number
): string {
  return `likeness-samples/${familyId}/${personaId}/${generationId}/${index}.png`;
}

export function isLikenessReviewSampleKey(key: string, familyId: string): boolean {
  return key.startsWith(`likeness-samples/${familyId}/`);
}
