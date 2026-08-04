import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 157 — Reanimated worklet safety guard (debugger audit, R1 polish).
 *
 * A `useAnimatedStyle` / `useDerivedValue` / `useAnimatedReaction` body is a
 * **worklet**: it runs on the Reanimated UI thread. Calling a plain JS function
 * (one not marked `'worklet'`) from inside it aborts the process with SIGABRT —
 * not a catchable JS red-box — so unit tests (no RN runtime) never see it. This
 * is exactly the crash that took the whole app down: `usePressFeedback`'s
 * animated style called `disableSpringForReducedMotion(...)`, a JS helper from
 * `./haptics`, on the UI thread.
 *
 * This guard reads the mobile source and asserts no worklet body calls a
 * function imported from the `./haptics` JS module (the class of helper that
 * caused the crash). It cannot prove every worklet is pure, but it locks the
 * regression: re-introducing a haptics-helper call inside an animated worklet
 * fails here.
 */

const ROOT = process.cwd();
const MOBILE = join(ROOT, "mobile");
const read = (p: string) => readFileSync(p, "utf8");

/** Recursively collect .ts/.tsx source under mobile (skipping node_modules). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Names destructured-imported from a `./haptics` (or `../lib/haptics`) module. */
function hapticsImports(src: string): string[] {
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*haptics["']/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

/**
 * Extract every worklet body: the `{...}` following a
 * `useAnimatedStyle(() => ` / `useDerivedValue(() => ` / `useAnimatedReaction`.
 * Brace-matched so nested objects don't truncate the body early.
 */
function workletBodies(src: string): string[] {
  const bodies: string[] = [];
  // Matches both arrow forms: `() => { ... }` and the object-shorthand
  // `() => ({ ... })`. Anchors on the opening `{` and brace-matches from there.
  const hookRe = /use(?:AnimatedStyle|DerivedValue|AnimatedReaction)\(\s*\(\)\s*=>\s*\(?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = hookRe.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    bodies.push(src.slice(start, i - 1));
  }
  return bodies;
}

describe("157 — no reanimated worklet calls a non-worklet haptics helper (UI-thread SIGABRT)", () => {
  const files = sourceFiles(MOBILE);

  it("finds worklet bodies to check (guard against extraction drift)", () => {
    const total = files.reduce((n, f) => n + workletBodies(read(f)).length, 0);
    // use-press-feedback + maya-ui (Twinkle/Float/toggle/checkbox/skeleton) + tab layout.
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it("no useAnimatedStyle/useDerivedValue body calls a function imported from ./haptics", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = read(file);
      const jsHelpers = hapticsImports(src);
      if (jsHelpers.length === 0) continue;
      for (const body of workletBodies(src)) {
        for (const name of jsHelpers) {
          // A call `name(` inside the worklet body is the crash pattern.
          if (new RegExp(`\\b${name}\\s*\\(`).test(body)) {
            offenders.push(`${file}: worklet calls JS helper ${name}()`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
