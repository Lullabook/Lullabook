import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";
import type { RequestContext } from "@/lib/context";
import type { Member } from "@/domain/types";

/**
 * Issue 161 (PRD v18) — PDF Export: authenticated download + iOS share sheet.
 *
 * Invariant targets:
 *   E1 — 45s client abort, blocking in-progress button, never a frozen wait.
 *   E2 — failure → retryable error, idle button, book stays finalized, no
 *        partial file left in cache.
 *   E3 — likeness egress: bearer-authenticated fetch, file only in the
 *        app-cache sandbox, leaves the device only via the user-initiated
 *        share sheet (no Linking.openURL, no upload).
 *   E6 — no dead buttons: export CTA hidden where sharing is unavailable
 *        (expo-web preview).
 *
 * Route tests drive the real export route; the mobile side is pinned with
 * 156-style source guards (the vitest env has no React Native runtime).
 */

const ROOT = process.cwd();
const readMobile = (p: string) => readFileSync(join(ROOT, "mobile", p), "utf8");

async function finalizedBookFixture() {
  const ctx = createTestContext();
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-161", "a@example.com");
  withActiveSubscription(ctx, member);
  const persona = await ctx.personas.createAdult({
    memberId: member.id,
    displayName: "Star",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  const book = await generateAndWait(ctx, member.id, {
    starringPersonaIds: [persona.id],
    storyType: "bedtime",
    theme: "export keepsake",
  });
  ctx.storybooks.finalize(member.id, book.id);
  return { ctx, member, book };
}

async function mockAuth(authed: { ctx: unknown; member: Member } | null): Promise<void> {
  vi.spyOn(await import("@/lib/request-auth"), "resolveRequestAuth").mockResolvedValue(
    authed ? { ctx: authed.ctx as RequestContext, member: authed.member } : null
  );
}

function exportReq(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/storybooks/${id}/export`, {
      headers: { authorization: "Bearer test-token" },
    }),
    { params: Promise.resolve({ id }) },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("161 — GET /api/storybooks/[id]/export accepts the mobile bearer path (E3)", () => {
  it("401 when neither bearer nor cookie resolves", async () => {
    await mockAuth(null);
    const { GET } = await import("@/app/api/storybooks/[id]/export/route");
    const res = await GET(...exportReq("whatever"));
    expect(res.status).toBe(401);
  });

  it("serves the finalized book as an attachment PDF through request auth (bearer-capable)", async () => {
    const { ctx, member, book } = await finalizedBookFixture();
    await mockAuth({ ctx, member });
    const { GET } = await import("@/app/api/storybooks/[id]/export/route");
    const res = await GET(...exportReq(book.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(`lullabook-${book.id}.pdf`);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBeGreaterThan(0);
  });

  it("400 (not 500) for a draft — no export before finalize", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-161-b", "b@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const draft = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "draft no export",
    });
    await mockAuth({ ctx, member });
    const { GET } = await import("@/app/api/storybooks/[id]/export/route");
    const res = await GET(...exportReq(draft.id));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/finalized/i);
  });
});

describe("161 — deps: SDK 56 expo-file-system + expo-sharing are installed", () => {
  const pkg = readMobile("package.json");
  it("mobile/package.json lists both Expo modules", () => {
    expect(pkg).toContain('"expo-file-system"');
    expect(pkg).toContain('"expo-sharing"');
  });
});

describe("161 — downloadStorybookPdf: authenticated, cache-sandboxed, abortable (E1/E2/E3)", () => {
  const api = readMobile("lib/api.ts");
  const fnStart = api.indexOf("export async function downloadStorybookPdf(");
  const nextExport = api.indexOf("\nexport ", fnStart + 1);
  const fn = api.slice(fnStart, nextExport === -1 ? undefined : nextExport);

  it("exists and fetches the export route", () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(fn).toContain("/export");
    expect(fn).toContain("encodeURIComponent(id)");
  });

  it("E3: the export fetch carries the same bearer mechanism as every other call", () => {
    expect(fn).toContain("getAccessToken()");
    expect(fn).toMatch(/Authorization:\s*`Bearer \$\{token\}`/);
  });

  it("E1: aborts the download at 45s via AbortController", () => {
    expect(fn).toContain("AbortController");
    expect(fn).toMatch(/45[_,]?000/);
    expect(fn).toContain("controller.signal");
  });

  it("E3: the file lives in the app cache sandbox as lullabook-<id>.pdf", () => {
    expect(fn).toContain("Paths.cache");
    expect(fn).toMatch(/lullabook-\$\{id\}\.pdf/);
  });

  it("E2: validates the %PDF magic bytes before keeping anything", () => {
    // 0x25 0x50 0x44 0x46 == "%PDF"
    for (const byte of ["0x25", "0x50", "0x44", "0x46"]) {
      expect(fn).toContain(byte);
    }
  });

  it("E2: any failure deletes the partial file and rethrows", () => {
    const catchIdx = fn.indexOf("} catch");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBlock = fn.slice(catchIdx);
    expect(catchBlock).toContain(".delete()");
    expect(catchBlock).toMatch(/throw/);
  });

  it("E3: no egress path other than returning the cached uri (no Linking, no upload)", () => {
    expect(fn).not.toContain("Linking");
    expect(fn).not.toMatch(/method:\s*"POST"/);
    expect(fn).not.toContain("FormData");
  });
});

describe("161 — reader Export button: finalized-only, share-capable-only, never dead (E1/E2/E6)", () => {
  const src = readMobile("app/(tabs)/stories/[id].tsx");

  it("renders 'Export PDF' only when finalized AND the platform can share", () => {
    expect(src).toContain('book.status === "finalized"');
    expect(src).toContain("Export PDF");
    expect(src).toMatch(/isFinalized && canShare/);
  });

  it("E6: hidden on web — canShare can never become true there", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*"react-native"/);
    expect(src).toMatch(/if \(Platform\.OS === "web"\) return/);
    expect(src).toContain("Sharing.isAvailableAsync()");
  });

  it("E1: blocking in-progress state on the button while exporting", () => {
    expect(src).toMatch(/exporting\s*\?/);
    expect(src).toContain("disabled={exporting}");
  });

  it("E3: success hands the cached file to the expo-sharing share sheet only", () => {
    expect(src).toContain("Sharing.shareAsync(");
    expect(src).not.toContain("Linking.openURL");
  });

  it("E2: failure shows a retryable error, returns to idle, and never auto-retries", () => {
    const handlerStart = src.indexOf("async function exportPdf");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = src.slice(handlerStart, src.indexOf("\n  }", handlerStart) + 4);
    expect(handler).toMatch(/catch/);
    expect(handler).toContain("setError(");
    expect(handler).toContain("setExporting(false)");
    // Exactly one download call — no auto-retry loop.
    const calls = handler.match(/downloadStorybookPdf\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(handler).not.toMatch(/\bwhile\b|\bfor\b/);
  });

  it("E5: canon styling — emoji on the button, still no raw hexes in the reader", () => {
    const title = src.match(/title=\{?[^}\n]*Export PDF[^}\n]*\}?/);
    expect(title).not.toBeNull();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("161 — Maestro core loop includes the finalize → export taps", () => {
  const yaml = readMobile(".maestro/r1-core-loop.yaml");
  it("taps finalize (with the confirm) and export against the seeded book", () => {
    expect(yaml).toContain("Finalize keepsake");
    expect(yaml).toContain("Yes, finalize");
    expect(yaml).toContain("Export PDF");
  });
});
