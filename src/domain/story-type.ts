import type { StoryType } from "@/domain/types";

export type CanonicalStoryType = Exclude<StoryType, "learning">;

export function normalizeStoryType(storyType: StoryType): CanonicalStoryType {
  return storyType === "learning" ? "lesson" : storyType;
}

export const STORY_TYPES: CanonicalStoryType[] = [
  "everyday",
  "milestone",
  "adventure",
  "lesson",
  "bedtime",
  "silly",
];

export const DEFAULT_PAGE_COUNT = 12;
export const SHORT_PAGE_COUNT = 5;

export function resolvePageCount(brief: { pageCount?: number }): number {
  return brief.pageCount ?? DEFAULT_PAGE_COUNT;
}

export function readyPageFloor(pageCount: number): number {
  return Math.max(1, pageCount - 2);
}
