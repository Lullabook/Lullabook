/**
 * Story generation must stream at the R1 output ceiling.
 *
 * Live-audit finding (2026-07-31): every Storybook generation failed with
 *
 *   Streaming is required for operations that may take longer than 10 minutes.
 *
 * `MAX_TOKENS` is 24000 (`anthropic.ts`), and the Anthropic SDK refuses a
 * NON-streaming request whose `max_tokens` implies the call could exceed the
 * 10-minute HTTP ceiling. Three of the four call sites in the adapter — the
 * structured Story pass, the plain-text Story pass, and the Personalized
 * Classic pass — used `client.messages.create` at `MAX_TOKENS`, so the core
 * promise of the app (generate one illustrated Bedtime Story) could not
 * succeed against the real provider at all. Reproduced against the running dev
 * server: `POST /api/storybooks` → 400 with that message, every time.
 *
 * The deterministic suite never caught it because the fake Anthropic adapter
 * has no such ceiling — only the real SDK enforces it.
 *
 * The fix is `client.messages.stream(...).finalMessage()`, which the SDK
 * documents as the supported path for large `max_tokens`. This gate pins it at
 * the source level: no `messages.create` call in the adapter may run at
 * `MAX_TOKENS`. The one small call (the ~80-token avatar blurb) stays
 * non-streaming and is unaffected.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(path.join(process.cwd(), "src/adapters/anthropic.ts"), "utf8");

/** Each `client.messages.<verb>({ … max_tokens: X` occurrence in source order. */
function callSites(): { verb: string; maxTokens: string }[] {
  const re = /client\.messages\.(create|stream)\(\{[\s\S]{0,400}?max_tokens:\s*([A-Za-z0-9_]+)/g;
  const found: { verb: string; maxTokens: string }[] = [];
  for (const m of SRC.matchAll(re)) found.push({ verb: m[1], maxTokens: m[2] });
  return found;
}

describe("Anthropic adapter — streaming at the output ceiling", () => {
  it("never issues a non-streaming request at MAX_TOKENS", () => {
    const offenders = callSites().filter(
      (c) => c.verb === "create" && c.maxTokens === "MAX_TOKENS",
    );
    expect(offenders).toEqual([]);
  });

  it("still has the MAX_TOKENS call sites, and they all stream", () => {
    const big = callSites().filter((c) => c.maxTokens === "MAX_TOKENS");
    // Structured Story pass, plain-text Story pass, Personalized Classic pass.
    expect(big.length).toBe(3);
    expect(big.every((c) => c.verb === "stream")).toBe(true);
  });

  it("resolves the streamed response via finalMessage()", () => {
    const streamCalls = (SRC.match(/client\.messages\.stream\(/g) ?? []).length;
    const finalMessageCalls = (SRC.match(/\.finalMessage\(\)/g) ?? []).length;
    expect(streamCalls).toBeGreaterThan(0);
    expect(finalMessageCalls).toBe(streamCalls);
  });
});
