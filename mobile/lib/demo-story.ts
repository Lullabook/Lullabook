/**
 * Issue 174 (ADR-0023, FAIL-5) — the bundled, baby-free demo Story.
 *
 * This is a **static module**: no network, no auth, no fetch. The first-open
 * "aha" must survive a cold start with zero connectivity, so the demo Story
 * ships inside the app binary and mirrors the server's canonical DEMO_STORY
 * (src/services/first-open.ts). If the two drift, the 174 test fails.
 */

export interface DemoStoryPage {
  text: string;
  illustrationSeed: string;
}

export interface BundledDemoStory {
  title: string;
  pages: DemoStoryPage[];
  characters: { name: string; isFictional: boolean }[];
  isBabyFree: true;
  requiresSignup: false;
  requiresCard: false;
}

export const DEMO_STORY: BundledDemoStory = {
  title: "Maya and the Moon",
  pages: [
    { text: "Once upon a time, Maya looked up at the moon and smiled.", illustrationSeed: "demo-page-1" },
    { text: "'Goodnight, moon,' she whispered, and the moon glowed soft and warm.", illustrationSeed: "demo-page-2" },
    { text: "The moon sang a lullaby, and Maya drifted off to sleep.", illustrationSeed: "demo-page-3" },
    { text: "And in her dreams, she danced among the stars.", illustrationSeed: "demo-page-4" },
  ],
  characters: [
    { name: "Maya", isFictional: true },
    { name: "The Moon", isFictional: true },
  ],
  isBabyFree: true,
  requiresSignup: false,
  requiresCard: false,
};

/**
 * FAIL-5 guard: a demo Story is renderable iff it has a title and at least one
 * page of text. Anything else must skip-to-paywall, never a white screen.
 */
export function isRenderableDemoStory(story: unknown): story is BundledDemoStory {
  if (!story || typeof story !== "object") return false;
  const s = story as BundledDemoStory;
  return (
    typeof s.title === "string" &&
    s.title.length > 0 &&
    Array.isArray(s.pages) &&
    s.pages.length > 0 &&
    s.pages.every((p) => typeof p?.text === "string" && p.text.length > 0)
  );
}
