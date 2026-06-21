import Link from "next/link";
import type { Metadata } from "next";
import { RosterAvatar } from "@/components/v2/roster-avatar";
import { BookCover } from "@/components/v2/book-cover";
import { DevSeedButton } from "@/components/v2/dev-seed-button";
import { WorldJournalCards } from "@/components/v2/world-journal-cards";
import { HomeDashboard } from "@/components/v2/home-dashboard";
import { requireAuthedContext } from "@/lib/auth";
import { bookHref } from "@/lib/book-nav";
import { castLabel } from "@/lib/cast-label";

export const metadata: Metadata = { title: "World" };

function formatBookDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildWeeklyCreateHref(
  brief: {
    theme: string;
    starringPersonaIds: string[];
    starringCharacterIds?: string[];
    babyId?: string;
  },
  babyPersonaId: string | null
): string {
  const params = new URLSearchParams();
  params.set("theme", brief.theme);
  if (brief.babyId) params.set("baby", brief.babyId);
  const adults = brief.starringPersonaIds.filter((id) => id !== babyPersonaId);
  if (adults.length) params.set("personas", adults.join(","));
  if (brief.starringCharacterIds?.length) {
    params.set("characters", brief.starringCharacterIds.join(","));
  }
  params.set("weekly", "1");
  return `/storybooks/new?${params.toString()}`;
}

export default async function WorldPage() {
  const { ctx, member } = await requireAuthedContext();
  ctx.babies.ensureDefaultBaby(member.id);
  const home = ctx.world.getHome(member.id);
  const { baby, babyPersona, familyCount, characterCount, storyCount, avatars, recentBooks } = home;
  const babyInitial = baby.displayName.charAt(0).toUpperCase();
  const devSeedEnabled =
    process.env.NODE_ENV === "development" && process.env.DEV_DEMO_SEED === "true";

  const showDailyNudge = ctx.journalNudges.shouldShowDailyNudge(member.id, baby.id);
  const showWeekly = ctx.journalNudges.shouldShowWeeklySuggestion(member.id, baby.id);
  const weekMoments = ctx.moments.list(member.id, baby.id);
  const weeklyBrief = showWeekly
    ? ctx.journalNudges.assembleWeeklyBrief(
        member.id,
        baby.id,
        babyPersona?.id ?? null
      )
    : null;

  const today = new Date().toISOString().slice(0, 10);

  const dashboard = ctx.homeDashboard.getDashboard(member.id, baby.id);

  return (
    <div className="v2-stack">
      <WorldJournalCards
        dailyNudge={
          showDailyNudge
            ? {
                show: true,
                babyId: baby.id,
                babyName: baby.displayName,
                captureHref: `/daily?date=${today}`,
              }
            : null
        }
        weeklySuggestion={
          showWeekly && weeklyBrief
            ? {
                show: true,
                babyId: baby.id,
                babyName: baby.displayName,
                momentCount: weekMoments.filter((m) => {
                  const mon = new Date();
                  const day = mon.getUTCDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  mon.setUTCDate(mon.getUTCDate() + diff);
                  const weekStart = mon.toISOString().slice(0, 10);
                  return m.occurredOn >= weekStart;
                }).length,
                createHref: buildWeeklyCreateHref(weeklyBrief, babyPersona?.id ?? null),
              }
            : null
        }
      />

      <HomeDashboard dashboard={dashboard} />

      <section>
        <div className="v2-section-head">
          <h2 className="v2-section-title">Everyone in {baby.displayName}&apos;s world</h2>
          <Link className="v2-link-action" href="/family">
            Manage family →
          </Link>
        </div>
        {avatars.length === 0 ? (
          <p className="v2-page-lead">Add family members and characters to fill this world.</p>
        ) : (
          <div className="v2-avatar-row">
            {avatars.map((a) => (
              <div key={a.personaId} className="v2-avatar-chip">
                <RosterAvatar
                  name={a.name}
                  initial={a.initial}
                  avBg={a.avBg}
                  status={a.personaStatus ?? "ready"}
                  avatarKey={a.avatarKey}
                  size={68}
                  className="v2-avatar-chip__circle"
                  badge={<span className="v2-avatar-chip__badge">{a.badge}</span>}
                />
                <span className="v2-avatar-chip__name">{a.name}</span>
                <span className="v2-avatar-chip__role">{a.role}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="v2-section-head">
          <h2 className="v2-section-title">Lately in {baby.displayName}&apos;s world</h2>
          <Link className="v2-link-action" href="/stories">
            All stories →
          </Link>
        </div>
        {recentBooks.length === 0 ? (
          <div className="v2-empty">
            <span className="v2-empty__icon" aria-hidden="true">
              📚
            </span>
            <h2 className="v2-section-title">No stories yet</h2>
            <p className="v2-page-lead" style={{ marginBottom: 20 }}>
              Start a new story and it will appear here.
            </p>
            <Link className="v2-btn v2-btn--amber" href="/storybooks/new">
              ✨ Start a new story
            </Link>
          </div>
        ) : (
          <div className="v2-book-grid">
            {recentBooks.map((book) => (
              <BookCover
                key={book.id}
                title={book.brief.theme}
                status={book.status}
                href={bookHref(book.status, book.id)}
                cast={castLabel(ctx, book, member.id)}
                date={formatBookDate(book.createdAt)}
                seed={book.id}
              />
            ))}
          </div>
        )}
      </section>

      {devSeedEnabled && (
        <section style={{ opacity: 0.8 }}>
          <DevSeedButton />
        </section>
      )}
    </div>
  );
}
