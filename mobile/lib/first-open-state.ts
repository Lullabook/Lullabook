/**
 * Issue 174 — persisted first-open state (has the demo been seen?).
 *
 * Reuses the platform AuthStorage adapter (SecureStore on iOS, localStorage
 * on web preview) so there is exactly one storage seam to fake in tests.
 * Reads fail-open to "seen" wins nothing: a storage error must never trap the
 * user in the demo, so errors resolve as `hasSeenDemo: true`.
 */
import { selectAuthStorage } from "@/lib/auth-storage";
import { HAS_SEEN_DEMO_KEY } from "@/lib/first-open";

export async function hasSeenDemo(): Promise<boolean> {
  try {
    return (await selectAuthStorage().getItem(HAS_SEEN_DEMO_KEY)) === "1";
  } catch {
    // Broken storage → skip the demo rather than risk replaying it forever.
    return true;
  }
}

export async function markDemoSeen(): Promise<void> {
  try {
    await selectAuthStorage().setItem(HAS_SEEN_DEMO_KEY, "1");
  } catch {
    // Best-effort; worst case the demo replays once next launch.
  }
}
