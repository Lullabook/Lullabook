import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 159 — Apple Sign-In fallback must be inert on the expo-web preview
 * (part3 audit, handoff follow-up #7).
 *
 * `expo-apple-authentication` is native-only. On web the module degrades
 * gracefully (`isAvailableAsync()` → false, the native button renders null),
 * so `appleAvailable` is always false there — which means the *fallback*
 * `Pressable` "Continue with Apple" is what renders. Tapping it calls
 * `AppleAuthentication.signInAsync()`, which throws an UnavailabilityError:
 * a reachable, always-broken button. R1 doctrine (mobile/lib/r1-flags.ts):
 * an unavailable feature renders an inert state — never a dead button.
 *
 * Guard (149-style source assertion, same shape as tests/158 for
 * auth-storage): on both auth screens, the Apple fallback branch must be
 * gated off on web via `Platform.OS === "web" ? null`. The iOS shipping path
 * (native AppleAuthenticationButton when available, warm fallback otherwise)
 * is unchanged.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, "mobile", "app", p), "utf8");

for (const file of ["sign-in.tsx", "sign-up.tsx"]) {
  describe(`159 — ${file}: Apple fallback button is web-gated`, () => {
    const src = read(file);

    it("imports Platform so the gate can exist", () => {
      expect(src).toMatch(/import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*"react-native"/);
    });

    it("renders null on web instead of the dead Apple fallback Pressable", () => {
      // The fallback branch lives between the `appleAvailable ?` ternary and
      // the fallback button's accessibility label. That slice must bail to
      // null on web before any Pressable is reachable.
      const start = src.indexOf("appleAvailable ?");
      expect(start, `${file}: appleAvailable ternary not found`).toBeGreaterThan(-1);
      const end = src.indexOf("Continue with Apple", start);
      expect(end, `${file}: Apple fallback branch not found`).toBeGreaterThan(start);
      const branch = src.slice(start, end);
      expect(
        /Platform\.OS\s*===\s*"web"\s*\?\s*null/.test(branch),
        `${file}: the Apple fallback <Pressable> is reachable on web — it must render null there (expo-apple-authentication has no web implementation; the tap throws UnavailabilityError)`
      ).toBe(true);
    });

    it("keeps the native Apple button path for iOS (shipping path unchanged)", () => {
      expect(src).toContain("AppleAuthentication.AppleAuthenticationButton");
      expect(src).toContain("appleAvailable ?");
    });
  });
}
