import { redirect } from "next/navigation";
import type { Member } from "@/domain/types";
import { createRequestContext, type RequestContext } from "@/lib/context";
import { createAuthClient } from "@/lib/supabase";

export interface AuthedContext {
  ctx: RequestContext;
  member: Member;
}

/**
 * Resolve the Supabase auth user and hydrate their Family into a fresh
 * request context. First sign-in has no Member row yet — onboarding creates
 * the Family + Guardian (jurisdiction comes from the signup form metadata,
 * defaulting to US).
 */
export async function getAuthedContext(): Promise<AuthedContext | null> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const ctx = createRequestContext();
  let member = await ctx.store.hydrateByAuthUser(user.id);
  if (!member) {
    member = ctx.onboarding.ensureFamilyForNewUser(
      user.id,
      user.email ?? "",
      (user.user_metadata?.jurisdiction as string | undefined) ?? "US"
    );
    await ctx.persist();
  }
  return { ctx, member };
}

/** Page/route guard: redirect anonymous visitors to sign-in. */
export async function requireAuthedContext(): Promise<AuthedContext> {
  const authed = await getAuthedContext();
  if (!authed) redirect("/sign-in");
  return authed;
}
