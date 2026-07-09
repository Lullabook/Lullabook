/**
 * Issue 174 — first-open entry routing, as a pure function.
 *
 * The funnel is demo → signup → trial → consent → photos (Issue 131 order).
 * Keeping the decision out of React means CI can enforce it, and FAIL-5
 * ("never a white screen") is a branch here, not a hope in a component.
 */

export interface FirstOpenState {
  /** A persisted Supabase session exists (auth-storage). */
  hasSession: boolean;
  /** The demo Story was already completed/dismissed on this install. */
  hasSeenDemo: boolean;
  /** The bundled demo passed isRenderableDemoStory (FAIL-5 guard). */
  demoRenderable: boolean;
}

export type FirstOpenRoute = "/(tabs)" | "/demo" | "/sign-up";

export function resolveFirstOpenRoute(state: FirstOpenState): FirstOpenRoute {
  // A live session always wins — returning users never re-see the funnel.
  if (state.hasSession) return "/(tabs)";
  // FAIL-5: a demo we can't render must never be routed to. Skip forward in
  // the funnel (sign-up → paywall), never show a blank story shell.
  if (!state.demoRenderable) return "/sign-up";
  if (state.hasSeenDemo) return "/sign-up";
  return "/demo";
}

/** AsyncStorage/SecureStore key marking the demo as seen on this install. */
export const HAS_SEEN_DEMO_KEY = "lullabook.hasSeenDemo";
