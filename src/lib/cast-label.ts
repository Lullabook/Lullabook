import type { RequestContext } from "@/lib/context";
import type { Storybook } from "@/domain/types";

/**
 * Human-readable cast line for a book cover ("Maya & Nani"), resolving the
 * Brief's starring Persona + Character ids to display names. Falls back to the
 * Story Type when no cast can be resolved. RLS-safe via the family-scoped store.
 */
export function castLabel(
  ctx: RequestContext | { store: RequestContext["store"] },
  book: Storybook,
  memberId: string
): string {
  const names: string[] = [];
  for (const id of book.brief.starringPersonaIds ?? []) {
    try {
      const p = ctx.store.getPersona(id, memberId);
      if (p) names.push(p.displayName);
    } catch {
      /* not visible to this member — skip */
    }
  }
  for (const id of book.brief.starringCharacterIds ?? []) {
    try {
      const c = ctx.store.getCharacter(id, memberId);
      if (c) names.push(c.displayName);
    } catch {
      /* skip */
    }
  }
  if (names.length === 0) {
    return book.brief.storyType.replace("_", " ");
  }
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, 2).join(", ")} & ${names.length - 2} more`;
}
