/**
 * expo-av is not bundled in Expo Go on SDK 54+ (it was removed and deprecated in
 * favor of expo-audio/expo-video). A static `import { Audio } from "expo-av"`
 * therefore throws `Cannot find native module 'ExponentAV'` at module-load time,
 * which red-screens the entire app in Expo Go.
 *
 * This lazy accessor defers the `require` so importing a screen that uses audio
 * never crashes. It returns `null` when the native module is unavailable (Expo
 * Go); callers degrade gracefully. A dev/EAS build includes ExponentAV and this
 * resolves to the real module.
 *
 * NOTE: do not add a top-level `import ... from "expo-av"` (even `import type`) —
 * Metro's Babel does not reliably elide the `import type * as` namespace form and
 * emits a runtime require, reintroducing the crash. Use inline `import("expo-av")`
 * type positions only; those are always erased.
 */
type AudioModule = typeof import("expo-av").Audio;

let cached: AudioModule | null | undefined;

export function getAudio(): AudioModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = (require("expo-av") as typeof import("expo-av")).Audio;
    } catch {
      cached = null;
    }
  }
  return cached;
}
