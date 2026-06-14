import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { V2Composer } from "@/components/v2/composer";

export const metadata: Metadata = { title: "Create a story" };

export default async function NewStorybookPage({
  searchParams,
}: {
  searchParams: Promise<{
    theme?: string;
    personas?: string;
    characters?: string;
    weekly?: string;
  }>;
}) {
  const { ctx, member } = await requireAuthedContext();
  const params = await searchParams;
  const subscribed = ctx.subscriptions.isActive(member.familyId);
  const baby = ctx.babies.getSelected(member.id) ?? ctx.babies.ensureDefaultBaby(member.id);

  const personas = ctx.store.getPersonasByFamily(member.familyId, member.id);
  const babyPersona = personas.find((p) => p.kind === "baby");
  const adults = personas
    .filter((p) => p.kind === "adult")
    .map((p) => ({ id: p.id, displayName: p.displayName, status: p.status }));
  const characters = ctx.store
    .getCharactersByFamily(member.familyId, member.id)
    .map((c) => ({ id: c.id, displayName: c.displayName }));

  const initialAdultIds = params.personas?.split(",").filter(Boolean) ?? [];
  const initialCharacterIds = params.characters?.split(",").filter(Boolean) ?? [];
  const initialTheme = params.theme ? decodeURIComponent(params.theme) : "";

  if (params.weekly === "1") {
    ctx.journalNudges.markWeeklySuggestionSeen(member.id, baby.id);
    await ctx.persist();
  }

  return (
    <div className="v2-stack" style={{ gap: 8 }}>
      <div>
        <p className="v2-page-eyebrow">✨ New story</p>
        <h1 className="v2-page-title">Create a story</h1>
        <p className="v2-page-lead" style={{ maxWidth: 580, marginBottom: 8 }}>
          Pick who stars, choose a kind of story, and tell us the idea. We&apos;ll
          write and illustrate it starring {baby.displayName}.
        </p>
      </div>

      {!subscribed && (
        <div className="alert alert-warning" style={{ marginBottom: 8 }}>
          Illustrated Storybooks need an active subscription.{" "}
          <Link href="/billing">See plans</Link> — or create a{" "}
          <Link href="/stories/new">free text Story</Link> with no photos at all.
        </div>
      )}

      <V2Composer
        babyName={baby.displayName}
        babyPersona={
          babyPersona
            ? { id: babyPersona.id, displayName: babyPersona.displayName, status: babyPersona.status }
            : null
        }
        adults={adults}
        characters={characters}
        initialTheme={initialTheme}
        initialAdultIds={initialAdultIds}
        initialCharacterIds={initialCharacterIds}
      />
    </div>
  );
}
