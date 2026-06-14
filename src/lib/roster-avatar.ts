import type { Persona, PersonaStatus } from "@/domain/types";

/** Family-scoped blob key for the generated roster portrait (ADR-0020). */
export function rosterAvatarBlobKey(familyId: string, personaId: string): string {
  return `avatars/${familyId}/${personaId}.png`;
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
