import type { StorybookStatus } from "@/domain/types";

/**
 * Canonical status-aware routing for a Storybook cover tap (UX spec §1.3):
 * only a finalized book opens the Reader; everything else (draft/generating/
 * failed) opens the detail/curation surface.
 */
export function bookHref(status: StorybookStatus, id: string): string {
  if (status === "finalized") return `/storybooks/${id}/read`;
  return `/storybooks/${id}`;
}

/** Where "Resume reading" should land for a finalized book. */
export function resumeHref(id: string, page?: number): string {
  return page && page > 0 ? `/storybooks/${id}/read?page=${page}` : `/storybooks/${id}/read`;
}
