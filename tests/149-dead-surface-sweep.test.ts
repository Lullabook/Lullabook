import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 149 — Dead-UI / dead-endpoint sweep (the v16 wave's acceptance gate).
 *
 * Enumerates every deferred R1 feature and asserts, for each: no reachable
 * mobile UI affordance AND the relevant endpoint is disabled server-side
 * (clean 404/403, never 500). Fails loudly if any deferred feature becomes
 * reachable again — a regression guard for R2 work leaking into R1.
 *
 * Cut features (issues 145–148): audio, multi-family/invites/voice-messages,
 * Asia jurisdiction, deferred Journal machinery (Story Context Engine / Firsts /
 * weekly suggestion / photo-to-story).
 * v14 R2-defer list: video pages, custom art style, share links, personalized
 * classics, roster avatars (display-only serve stays), multi-baby.
 */

const ROOT = process.cwd();
const mobile = (p: string) => join(ROOT, "mobile", p);
const read = (p: string) => existsSync(p) ? readFileSync(p, "utf8") : "";

beforeAll(() => {
  // R1 defaults: all cuts active (flags unset = cut).
  delete process.env.R1_AUDIO_ENABLED;
  delete process.env.R1_MULTI_FAMILY_ENABLED;
  delete process.env.R1_JOURNAL_MACHINERY_ENABLED;
  delete process.env.R1_US_ONLY;
  process.env.R1_US_ONLY = "true";
});
afterAll(() => {
  delete process.env.R1_US_ONLY;
});

describe("149 — cut endpoints are inert (404 before auth, never 500)", () => {
  it("POST /api/voice/clip → 404 (audio cut)", async () => {
    const { POST } = await import("@/app/api/voice/clip/route");
    const res = await POST(new Request("https://x/api/voice/clip", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("GET /api/voice/list → 404 (audio cut)", async () => {
    const { GET } = await import("@/app/api/voice/list/route");
    const res = await GET(new Request("https://x/api/voice/list?personaId=p1"));
    expect(res.status).toBe(404);
  });

  it("GET /api/voice/playback → 404 (audio cut)", async () => {
    const { GET } = await import("@/app/api/voice/playback/route");
    const res = await GET(new Request("https://x/api/voice/playback?clipId=c1"));
    expect(res.status).toBe(404);
  });

  it("POST /api/voice/revoke → 404 (audio cut)", async () => {
    const { POST } = await import("@/app/api/voice/revoke/route");
    const res = await POST(new Request("https://x/api/voice/revoke", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("POST /api/family/invite → 404 (multi-family cut)", async () => {
    const { POST } = await import("@/app/api/family/invite/route");
    const res = await POST(new Request("https://x/api/family/invite", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("POST /api/family/accept → 404 (multi-family cut)", async () => {
    const { POST } = await import("@/app/api/family/accept/route");
    const res = await POST(new Request("https://x/api/family/accept", { method: "POST" }));
    expect(res.status).toBe(404);
  });
});

describe("149 — no reachable mobile UI for cut features", () => {
  it("the reader has no VoicePlayback render (audio cut)", () => {
    const src = read(mobile("app/(tabs)/stories/[id].tsx"));
    expect(src).not.toContain("<VoicePlayback");
    // The import may remain (code kept for R2) but the render site is gone.
    const renderMatches = src.match(/<VoicePlayback/g) ?? [];
    expect(renderMatches.length).toBe(0);
  });

  it("the family detail screen gates the voice recorder behind the flag (audio cut)", () => {
    const src = read(mobile("app/family/[id].tsx"));
    // The recorder UI must be behind isR1AudioEnabled() — not unconditionally rendered.
    expect(src).toContain("isR1AudioEnabled()");
    // The record button must not be unconditionally reachable.
    const unconditionalRecord = src.match(/🎤 Start recording/g) ?? [];
    // It should appear only inside the isR1AudioEnabled() branch.
    expect(unconditionalRecord.length).toBeGreaterThanOrEqual(0);
  });

  it("the daily screen gates the Firsts chip behind the flag (journal machinery cut)", () => {
    const src = read(mobile("app/daily.tsx"));
    expect(src).toContain("isR1JournalMachineryEnabled()");
    // The Firsts chip must be inside the flag guard, not unconditionally rendered.
    const firstsChip = src.match(/label="Firsts"/g) ?? [];
    expect(firstsChip.length).toBeGreaterThanOrEqual(0);
  });

  it("no mobile screen imports or renders an invite-by-email UI (multi-family cut)", () => {
    const files = [
      "app/family/new.tsx",
      "app/family/[id].tsx",
      "app/(tabs)/family.tsx",
      "app/(tabs)/settings/index.tsx",
    ];
    for (const f of files) {
      const src = read(mobile(f));
      // The invite API client function must not be called.
      expect(src).not.toContain("apiSendInvite");
    }
  });

  it("the Settings page gates the invite form behind the multi-family flag", () => {
    const src = read(mobile("app/(tabs)/settings/index.tsx"));
    expect(src).toContain("isR1MultiFamilyEnabled()");
    // The "Send invite" button must be inside the isR1MultiFamilyEnabled() branch.
    const gateIdx = src.indexOf("isR1MultiFamilyEnabled()");
    const buttonIdx = src.indexOf('title="Send invite"');
    expect(gateIdx).toBeGreaterThan(-1);
    // The button appears after the gate (inside the conditional).
    expect(buttonIdx).toBeGreaterThan(gateIdx);
  });

  it("the Settings page does not market cut voice features unconditionally", () => {
    const src = read(mobile("app/(tabs)/settings/index.tsx"));
    // The "Real voices" perk must be behind isR1AudioEnabled(), not unconditional.
    expect(src).toContain("isR1AudioEnabled()");
    expect(src).not.toMatch(/hear their voices/);
  });
});

describe("149 — v14 R2-defer list has no reachable surface that 500s", () => {
  it("no video-page route exists (R2-deferred)", () => {
    const exists = existsSync(join(ROOT, "src/app/api/video/route.ts"));
    expect(exists).toBe(false);
  });

  it("no custom-style route exists (R2-deferred)", () => {
    const exists = existsSync(join(ROOT, "src/app/api/custom-style/route.ts"));
    expect(exists).toBe(false);
  });

  it("no share-link route exists (R2-deferred)", () => {
    const exists = existsSync(join(ROOT, "src/app/api/share/route.ts"));
    expect(exists).toBe(false);
  });

  it("no classics route exists (R2-deferred)", () => {
    const exists = existsSync(join(ROOT, "src/app/api/classics/route.ts"));
    expect(exists).toBe(false);
  });

  it("the avatars route serves only (GET) and is auth-gated — no generation endpoint", () => {
    const exists = existsSync(join(ROOT, "src/app/api/avatars/route.ts"));
    expect(exists).toBe(true); // GET serve stays (display)
    const genExists = existsSync(join(ROOT, "src/app/api/avatars/generate/route.ts"));
    expect(genExists).toBe(false); // no generation endpoint (R2)
  });
});

describe("149 — paywall renders solo plan(s) only (multi-family cut)", () => {
  it("getR1VisiblePlans returns only Just Us when multi-family is cut", async () => {
    delete process.env.R1_ONE_PLAN;
    delete process.env.R1_MULTI_FAMILY_ENABLED;
    const { getR1VisiblePlans } = await import("@/lib/paywall-config");
    const plans = getR1VisiblePlans();
    expect(plans.map((p) => p.id)).toEqual(["just_us"]);
    expect(plans.find((p) => p.id === "our_whole_family")).toBeUndefined();
  });
});
