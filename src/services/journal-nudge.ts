import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Brief } from "@/domain/types";
import {
  groupMomentsByWeek,
  isCurrentWeek,
  weekStartMonday,
} from "@/services/moment-week";
import type { MomentService } from "@/services/moment";

/** Minimum Moments in the current week to surface the weekly suggestion (issue 55). */
export const WEEKLY_STORY_MIN_MOMENTS = 3;

export interface DailyNudgeView {
  show: boolean;
  babyId: string;
  babyName: string;
  captureHref: string;
}

export interface WeeklySuggestionView {
  show: boolean;
  babyId: string;
  babyName: string;
  momentCount: number;
  significantCount: number;
  createHref: string;
}

export class JournalNudgeService {
  constructor(
    private readonly store: DataStore,
    private readonly moments: MomentService
  ) {}

  shouldShowDailyNudge(memberId: string, babyId: string, now = new Date()): boolean {
    const today = now.toISOString().slice(0, 10);
    if (this.moments.hasMomentOnDate(memberId, babyId, today)) return false;
    return !this.isSuppressed(memberId, babyId, "daily_dismiss", today);
  }

  dismissDailyNudge(memberId: string, babyId: string, now = new Date()): void {
    const today = now.toISOString().slice(0, 10);
    this.recordSuppression(memberId, babyId, "daily_dismiss", today);
  }

  shouldShowWeeklySuggestion(memberId: string, babyId: string, now = new Date()): boolean {
    const weekStart = weekStartMonday(now);
    if (!isCurrentWeek(weekStart, now)) return false;
    if (this.isSuppressed(memberId, babyId, "weekly_seen", weekStart)) return false;

    const all = this.moments.list(memberId, babyId);
    const week = groupMomentsByWeek(all, weekStart, now);
    const weekMoments = week.days.flatMap((d) => d.moments);
    const significant = weekMoments.filter((m) => m.isSignificant).length;
    return weekMoments.length >= WEEKLY_STORY_MIN_MOMENTS || significant >= 1;
  }

  markWeeklySuggestionSeen(memberId: string, babyId: string, now = new Date()): void {
    const weekStart = weekStartMonday(now);
    this.recordSuppression(memberId, babyId, "weekly_seen", weekStart);
  }

  assembleWeeklyBrief(
    memberId: string,
    babyId: string,
    babyPersonaId: string | null,
    now = new Date()
  ): Pick<Brief, "theme" | "starringPersonaIds" | "starringCharacterIds" | "babyId"> {
    const weekStart = weekStartMonday(now);
    const all = this.moments.list(memberId, babyId);
    const week = groupMomentsByWeek(all, weekStart, now);
    const weekMoments = week.days.flatMap((d) => d.moments);

    const personaIds = new Set<string>();
    const characterIds = new Set<string>();
    for (const m of weekMoments) {
      for (const link of this.store.getMomentPeople(m.id)) {
        if (link.personaId) personaIds.add(link.personaId);
        if (link.characterId) characterIds.add(link.characterId);
      }
    }

    const significant = weekMoments.filter((m) => m.isSignificant);
    const themeSource = significant[0] ?? weekMoments[0];
    const theme = themeSource
      ? `A week in the life: ${themeSource.body.slice(0, 80)}`
      : "A week in the life";

    const starringPersonaIds = babyPersonaId
      ? [babyPersonaId, ...personaIds]
      : [...personaIds];

    return {
      babyId,
      theme,
      starringPersonaIds: [...new Set(starringPersonaIds)],
      starringCharacterIds: characterIds.size ? [...characterIds] : undefined,
    };
  }

  private isSuppressed(
    memberId: string,
    babyId: string,
    kind: "daily_dismiss" | "weekly_seen",
    on: string
  ): boolean {
    return this.store
      .getJournalNudgeStates(memberId, babyId)
      .some((s) => s.kind === kind && s.suppressedOn === on);
  }

  private recordSuppression(
    memberId: string,
    babyId: string,
    kind: "daily_dismiss" | "weekly_seen",
    suppressedOn: string
  ): void {
    if (this.isSuppressed(memberId, babyId, kind, suppressedOn)) return;
    this.store.saveJournalNudgeState({
      id: uuid(),
      memberId,
      babyId,
      kind,
      suppressedOn,
      createdAt: new Date(),
    });
  }
}

/** Quiet hours for native daily push (issue 56) — local hour in 24h format. */
export const DAILY_PUSH_QUIET_START_HOUR = 21;
export const DAILY_PUSH_QUIET_END_HOUR = 8;

export interface DailyPushScheduleInput {
  hasPushPermission: boolean;
  hasMomentToday: boolean;
  localHour: number;
  alreadySentToday: boolean;
}

export class DailyPushScheduler {
  shouldSendPush(input: DailyPushScheduleInput): boolean {
    if (!input.hasPushPermission) return false;
    if (input.hasMomentToday) return false;
    if (input.alreadySentToday) return false;
    if (input.localHour >= DAILY_PUSH_QUIET_START_HOUR) return false;
    if (input.localHour < DAILY_PUSH_QUIET_END_HOUR) return false;
    return true;
  }

  captureDeepLink(babyId: string): string {
    return `/daily?baby=${babyId}&date=today`;
  }
}
