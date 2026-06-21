/**
 * First-open demo aha + Day-0 paywall (issue 98 / ADR-0023).
 *
 * The first-open experience that earns trust **before** the card, then places
 * the paywall at the moment of highest intent — required because there is no
 * free tier (ADR-0023).
 *
 * - A **pre-baked, baby-free demo Story** ("meet Maya") a new user can read +
 *   hear in <90s, no signup/card — the aha.
 * - After the aha, present the **Day-0 paywall** (annual-default; trial-of-
 *   Normal CTA); starting the trial requires a card (= VPC, ADR-0008) and
 *   unlocks putting **their** baby in stories.
 *
 * **Security:** the demo is baby-free (no child likeness); uploading the real
 * baby is gated behind starting the trial (card-on-file VPC).
 *
 * **Failure:** if the demo asset fails to load, the user still reaches a usable
 * state (retry / skip-to-paywall), never a white screen.
 */

export interface DemoStory {
  title: string;
  pages: { text: string; illustrationSeed: string }[];
  characters: { name: string; isFictional: boolean }[];
  isBabyFree: boolean;
  requiresSignup: boolean;
  requiresCard: boolean;
}

const DEMO_STORY: DemoStory = {
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

export class DemoStoryService {
  getDemoStory(): DemoStory {
    return DEMO_STORY;
  }
}

export interface FirstOpenStep {
  type: "demo" | "signup" | "paywall";
  label: string;
}

export interface FirstOpenFlow {
  steps: FirstOpenStep[];
  defaultBilling?: "annual" | "monthly";
  canSkipToPaywall: boolean;
  hasUsableState: boolean;
}

export class FirstOpenService {
  getFlow(): FirstOpenFlow {
    return {
      steps: [
        { type: "demo", label: "Read a demo story" },
        { type: "signup", label: "Create your family" },
        { type: "paywall", label: "Start your free trial" },
      ],
      defaultBilling: "annual",
      canSkipToPaywall: false,
      hasUsableState: true,
    };
  }

  onDemoFailed(): FirstOpenFlow {
    return {
      steps: [
        { type: "demo", label: "Read a demo story" },
        { type: "paywall", label: "Start your free trial" },
      ],
      defaultBilling: "annual",
      canSkipToPaywall: true,
      hasUsableState: true,
    };
  }
}
