import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  createSharedRequestCache,
  clearPrivateCaches,
  registerPrivateCache,
} from "../mobile/lib/private-cache";
import {
  countReaderStatusRequests,
  isTerminalStatus,
  nextReaderPollDelayMs,
  shouldFetchOnResume,
  shouldPollInAppState,
  shouldPollStorybook,
  STORYBOOK_READ_TIMEOUT_MS,
  StorybookReadTimeoutError,
} from "../mobile/lib/generation-flow";
import { AUTH_STARTUP_TIMEOUT_MS, resolveFirstOpenStartup } from "../mobile/lib/auth-startup";
import { shouldShowInitialSkeleton } from "../mobile/lib/render-state";
import {
  createTestContext,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";
import type { Member } from "@/domain/types";
import type { RequestContext } from "@/lib/context";

const ROOT = process.cwd();
const mobile = (path: string) => join(ROOT, "mobile", path);
const readMobile = (path: string) => readFileSync(mobile(path), "utf8");

async function mockAuth(authed: { ctx: unknown; member: Member } | null): Promise<void> {
  vi.spyOn(await import("@/lib/request-auth"), "resolveRequestAuth").mockResolvedValue(
    authed ? { ctx: authed.ctx as RequestContext, member: authed.member } : null
  );
}

async function generatingBookFixture() {
  const ctx = createTestContext();
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-193", "polling@example.com");
  withActiveSubscription(ctx, member);
  const persona = await ctx.personas.createAdult({
    memberId: member.id,
    displayName: "Star",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  const book = await ctx.storybooks.generate(member.id, {
    starringPersonaIds: [persona.id],
    storyType: "bedtime",
    theme: "A night on the moon",
  });
  expect(book.status).toBe("generating");
  return { ctx, member, book };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("193 — bounded polling and terminal status", () => {
  it("AC-1: a five-minute run makes no more than 40 status requests", () => {
    expect([0, 1, 2, 3, 4].map(nextReaderPollDelayMs)).toEqual([
      2_500,
      5_000,
      10_000,
      20_000,
      30_000,
    ]);
    expect(countReaderStatusRequests(5 * 60 * 1000)).toBeLessThanOrEqual(40);
  });

  it("AC-1: background pauses polling and an active transition requests one resume fetch", () => {
    expect(shouldPollInAppState("background")).toBe(false);
    expect(shouldPollInAppState("inactive")).toBe(false);
    expect(shouldPollInAppState("active")).toBe(true);
    expect(shouldFetchOnResume("background", "active")).toBe(true);
    expect(shouldFetchOnResume("active", "active")).toBe(false);
  });

  it("AC-2: polling stops for every terminal status", () => {
    for (const status of ["draft", "failed", "finalized"] as const) {
      expect(isTerminalStatus(status)).toBe(true);
      expect(shouldPollStorybook(status, false)).toBe(false);
    }
    expect(shouldPollStorybook("generating", false)).toBe(true);
  });
});

describe("193 — Storybook detail ETag/304 boundary", () => {
  it("AC-2: unchanged authorized detail returns 304 with an empty body and preserves progress fields", async () => {
    const { ctx, member, book } = await generatingBookFixture();
    await mockAuth({ ctx, member });
    const { GET } = await import("@/app/api/storybooks/[id]/route");
    const path = `http://localhost/api/storybooks/${book.id}`;

    const first = await GET(new Request(path), {
      params: Promise.resolve({ id: book.id }),
    });
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag");
    expect(etag).toMatch(/^"[\w+/=-]+"$/);
    const body = (await first.json()) as {
      id: string;
      status: string;
      progress: { phase: string; pagesReady: number; pagesTotal: number };
      pages: unknown[];
    };
    expect(body).toMatchObject({
      id: book.id,
      status: "generating",
      progress: { phase: "writing", pagesReady: 0, pagesTotal: 12 },
    });
    expect(body.pages).toEqual([]);

    const unchanged = await GET(
      new Request(path, { headers: { "If-None-Match": etag! } }),
      { params: Promise.resolve({ id: book.id }) }
    );
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("ETag")).toBe(etag);
    expect(await unchanged.text()).toBe("");

    await ctx.workflow.drain();
    const rendered = await GET(new Request(path), {
      params: Promise.resolve({ id: book.id }),
    });
    const renderedBody = await rendered.json() as { pages: Array<Record<string, unknown>> };
    expect(JSON.stringify(renderedBody)).not.toContain("illustrationBlobKey");
    expect(JSON.stringify(renderedBody)).not.toContain('"content"');
    expect(renderedBody.pages[0]).toMatchObject({
      hasIllustration: true,
      illustrationUrl: `/api/storybooks/pages/${renderedBody.pages[0]?.id as string}/image`,
    });
  });

  it("AC-2: a stuck status request has a bounded read budget and typed retry error", () => {
    expect(STORYBOOK_READ_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(new StorybookReadTimeoutError().name).toBe("StorybookReadTimeoutError");
  });
});

describe("193 — bounded auth startup", () => {
  it("AC-3: a hung auth read times out and routes to sign-in instead of holding splash", async () => {
    expect(AUTH_STARTUP_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    await expect(
      resolveFirstOpenStartup(
        {
          getSession: () => new Promise<boolean>(() => {}),
          hasSeenDemo: async () => false,
          demoRenderable: true,
        },
        5
      )
    ).resolves.toBe("/sign-in");
  });

  it("AC-3: an authenticated session never waits on demo storage", async () => {
    await expect(
      resolveFirstOpenStartup(
        {
          getSession: async () => true,
          hasSeenDemo: () => new Promise<boolean>(() => {}),
          demoRenderable: true,
        },
        5
      )
    ).resolves.toBe("/(tabs)");
  });
});

describe("193 — painted content and virtualized collections", () => {
  it("AC-4: refresh never replaces already-painted content with a first-load skeleton", () => {
    expect(shouldShowInitialSkeleton(true, false)).toBe(true);
    expect(shouldShowInitialSkeleton(true, true)).toBe(false);
    expect(shouldShowInitialSkeleton(false, true)).toBe(false);
    expect(readMobile("app/(tabs)/index.tsx")).toContain("shouldShowInitialSkeleton(loading, home !== null)");
    expect(readMobile("app/(tabs)/stories/[id].tsx")).toContain("shouldShowInitialSkeleton(loading, book !== null)");
    expect(readMobile("app/(tabs)/family.tsx")).toContain("shouldShowInitialSkeleton(loading, home !== null)");
    expect(readMobile("app/daily.tsx")).toContain("shouldShowInitialSkeleton(loading, home !== null)");
  });

  it("AC-5: reachable repeatable collections use native virtualization", () => {
    expect(readMobile("app/(tabs)/stories/index.tsx")).toContain("<ListScreen");
    expect(readMobile("app/daily.tsx")).toContain("<ListScreen");
    expect(readMobile("app/(tabs)/family.tsx")).toContain("<SectionListScreen");
    expect(readMobile("app/characters/index.tsx")).toContain("<ListScreen");
  });
});

describe("193 — private read deduplication and sign-out invalidation", () => {
  it("AC-5: concurrent reads share one request and clear before a next Family read", async () => {
    const cache = createSharedRequestCache<number>();
    let resolve: (value: number) => void = () => {};
    const loader = vi.fn(() => new Promise<number>((done) => { resolve = done; }));

    const first = cache.get(loader);
    const second = cache.get(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    resolve(7);
    await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
    await expect(cache.get(loader)).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);

    cache.clear();
    resolve = () => {};
    await expect(cache.get(async () => 8)).resolves.toBe(8);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("AC-6: registered private caches are cleared by the auth sign-out boundary", () => {
    const clear = vi.fn();
    const unregister = registerPrivateCache(clear);
    clearPrivateCaches();
    expect(clear).toHaveBeenCalledOnce();
    unregister();
  });

  it("AC-6: API reads opt out of shared HTTP caching and settings uses the clearing sign-out path", () => {
    expect(readMobile("lib/api.ts")).toContain('cache: "no-store"');
    expect(readMobile("lib/api.ts")).toContain("homeCacheIdentity");
    expect(readMobile("lib/supabase.ts")).toContain("clearPrivateCaches");
    expect(readMobile("app/(tabs)/settings/index.tsx")).toContain("signOutAndClearPrivateCaches");
  });
});

describe("193 — duplicate route artifacts", () => {
  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
  }

  it("AC-7: Expo app tree has no Finder duplicate route/source files", () => {
    const duplicates = filesUnder(mobile("app")).filter((path) => /\s\d+\.(tsx?|jsx?)$/.test(path));
    expect(duplicates).toEqual([]);
  });
});
