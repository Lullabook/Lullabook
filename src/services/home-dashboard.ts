import type { DataStore } from "@/db/store";
import type { MomentService } from "@/services/moment";
import type { StorybookService } from "@/services/storybook";
import type { Storybook } from "@/domain/types";

/**
 * Baby-hero Home dashboard + context-engine nudge (issue 97 / PRD v12).
 *
 * The health-app-style Home: a glanceable dashboard, not a settings list. The
 * emotional hero (the baby's World) + one primary CTA + four summary cards;
 * detail stays in the tabs (issue 96).
 *
 * **Cards:** Continue reading (last book), a context-engine Story nudge (from
 * issue 89 — e.g. "Maya's first steps last week — make a story?"), this-week /
 * streak, and Family activity. The nudge degrades to a friendly default when
 * the engine has nothing notable.
 *
 * **Security:** the dashboard renders **no raw uploaded photo** — only
 * generated avatars/illustrations (ADR-0020/0021).
 */

export interface DashboardHero {
  babyName: string;
  babyInitial: string;
  primaryCta: { label: string; href: string };
}

export type DashboardCardKind =
  | "continue-reading"
  | "story-nudge"
  | "this-week"
  | "family-activity";

export interface DashboardCard {
  kind: DashboardCardKind;
  title: string | null;
  subtitle?: string;
  href?: string;
}

export interface Dashboard {
  hero: DashboardHero;
  cards: DashboardCard[];
}

export class HomeDashboardService {
  constructor(
    private readonly store: DataStore,
    private readonly moments: MomentService,
    private readonly storybooks: StorybookService
  ) {}

  getDashboard(memberId: string, babyId: string): Dashboard {
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");

    const hero: DashboardHero = {
      babyName: baby.displayName,
      babyInitial: baby.displayName.charAt(0).toUpperCase(),
      primaryCta: { label: "Start a story", href: "/storybooks/new" },
    };

    const cards: DashboardCard[] = [
      this.buildContinueReadingCard(memberId, babyId),
      this.buildStoryNudgeCard(memberId, babyId),
      this.buildThisWeekCard(memberId, babyId),
      this.buildFamilyActivityCard(memberId, baby.familyId),
    ];

    return { hero, cards };
  }

  private buildContinueReadingCard(memberId: string, babyId: string): DashboardCard {
    const books = [...this.store.storybooks.values()]
      .filter((b) => b.createdByMemberId === memberId && b.babyId === babyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const lastBook = books[0];
    return {
      kind: "continue-reading",
      title: lastBook?.brief.theme ?? null,
      subtitle: lastBook ? `Last story · ${lastBook.status}` : undefined,
      href: lastBook ? `/storybooks/${lastBook.id}` : undefined,
    };
  }

  private buildStoryNudgeCard(memberId: string, babyId: string): DashboardCard {
    const recentMoments = this.moments.list(memberId, babyId);
    const significant = recentMoments.find((m) => m.isSignificant);

    if (significant) {
      return {
        kind: "story-nudge",
        title: `${significant.body}`,
        subtitle: "Make this a story?",
        href: `/storybooks/new?moment=${significant.id}`,
      };
    }

    // Friendly default when there's nothing notable
    return {
      kind: "story-nudge",
      title: "What happened today?",
      subtitle: "Log a moment to personalize stories",
      href: "/daily",
    };
  }

  private buildThisWeekCard(memberId: string, babyId: string): DashboardCard {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diff);
    const weekStart = monday.toISOString().slice(0, 10);

    const weekCount = [...this.store.storybooks.values()].filter(
      (b) =>
        b.createdByMemberId === memberId &&
        b.babyId === babyId &&
        b.createdAt.toISOString().slice(0, 10) >= weekStart
    ).length;

    return {
      kind: "this-week",
      title: `${weekCount} ${weekCount === 1 ? "story" : "stories"} this week`,
      subtitle: weekCount > 0 ? "Keep the streak going!" : "Start your first story this week",
      href: "/stories",
    };
  }

  private buildFamilyActivityCard(memberId: string, familyId: string): DashboardCard {
    const personas = this.store.getPersonasByFamily(familyId, memberId);
    const adults = personas.filter((p) => p.kind === "adult");
    const ready = adults.filter((p) => p.status === "ready").length;

    return {
      kind: "family-activity",
      title: `${adults.length} family member${adults.length === 1 ? "" : "s"}`,
      subtitle: ready > 0 ? `${ready} ready for stories` : "Add family members to start",
      href: "/family",
    };
  }
}
