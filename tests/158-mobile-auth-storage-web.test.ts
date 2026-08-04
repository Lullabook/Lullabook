import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 158 — Supabase auth storage must not use expo-secure-store on web
 * (debugger audit). expo-secure-store has NO web implementation; on Expo-web its
 * native methods (e.g. `getValueWithKeyAsync`) are undefined and throw the
 * instant Supabase reads the session — which crashed the baby-persona photo
 * upload on the web preview.
 *
 * This is a source guard (149/156/157 pattern): the fix is platform branching
 * that a node test can't execute (it imports react-native, whose Flow source
 * can't load in vitest), so we read the source and assert the structural
 * property — web is handled, and the web path never touches SecureStore.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, "mobile", p), "utf8");

describe("158 — auth storage is web-safe (no expo-secure-store in the browser)", () => {
  const authStorage = read("lib/auth-storage.ts");

  it("branches on the web platform", () => {
    // The selector must special-case web; otherwise every platform gets
    // SecureStore and web crashes.
    expect(authStorage).toMatch(/===\s*["']web["']|!==\s*["']web["']/);
  });

  it("the web storage path uses localStorage, not SecureStore", () => {
    // Isolate the web adapter block and prove it uses localStorage and calls no
    // SecureStore method.
    const start = authStorage.indexOf("webStorage");
    expect(start).toBeGreaterThan(-1);
    const nextConst = authStorage.indexOf("\nexport function", start);
    const webBlock = authStorage.slice(start, nextConst === -1 ? undefined : nextConst);
    expect(webBlock).toContain("localStorage");
    expect(webBlock).not.toMatch(/SecureStore\.\w+Async/);
  });

  it("native (iOS) still uses the encrypted SecureStore keychain", () => {
    const start = authStorage.indexOf("nativeStorage");
    const nextConst = authStorage.indexOf("\nconst webStorage", start);
    const nativeBlock = authStorage.slice(start, nextConst === -1 ? undefined : nextConst);
    expect(nativeBlock).toMatch(/SecureStore\.(getItem|setItem|deleteItem)Async/);
  });

  it("the supabase client wires the platform-aware selector, not a raw SecureStore adapter", () => {
    const supabase = read("lib/supabase.ts");
    expect(supabase).toContain("selectAuthStorage(");
    // The old always-SecureStore adapter must be gone (it was the bug).
    expect(supabase).not.toMatch(/storage:\s*SecureStoreAdapter/);
  });
});
