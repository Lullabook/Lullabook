import type { Brief, Page, StorybookStatus } from "@/domain/types";
import { resolvePageCount } from "@/domain/story-type";

/**
 * Issue 187 — server-derived generation progress projection.
 *
 * The reader polls this instead of guessing from client state: `phase` names
 * which pipeline stage is running (writing = text pass, illustrating = Pages
 * being generated), `pagesReady` counts terminal-ready Pages, and
 * `pagesTotal` is the planned count resolved from the Brief. Terminal
 * statuses project to their own phases so the reader can stop polling.
 */

export type StorybookProgressPhase = "writing" | "illustrating" | "complete" | "failed";

export interface StorybookProgress {
  phase: StorybookProgressPhase;
  pagesReady: number;
  pagesTotal: number;
}

export function deriveStorybookProgress(input: {
  status: StorybookStatus;
  brief: Brief;
  pages: Page[];
  hasPersistedText: boolean;
}): StorybookProgress {
  const pagesReady = input.pages.filter((p) => p.generationStatus === "ready").length;
  const pagesTotal = resolvePageCount(input.brief);

  let phase: StorybookProgressPhase;
  if (input.status === "failed") {
    phase = "failed";
  } else if (input.status === "draft" || input.status === "finalized") {
    phase = "complete";
  } else {
    // Still generating: the text pass commits a PersistedGeneration before
    // any Page exists, so its presence separates "writing" from "illustrating".
    phase = input.hasPersistedText ? "illustrating" : "writing";
  }
  return { phase, pagesReady, pagesTotal };
}
