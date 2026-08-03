/**
 * Local ticket 192 — Reduce authenticated read and blob-serving cost.
 *
 * Acceptance criteria covered here:
 *  - AC-1: /api/home, /api/storybooks, and authorized Story detail use no
 *    more than two sequential read waves (the read profile flattens the
 *    hydration fan-out and skips append-only ledgers on ordinary reads).
 *  - AC-2: write/RLS/Hard-delete paths still hydrate every required table
 *    (the full profile is unchanged).
 *  - AC-3: Home payload < 32KB at the R1 roster cap; Story detail < 500KB
 *    with no base64 images or provider artifact keys.
 *  - image/avatar Cache-Control + bearer fallback live in
 *    tests/192-blob-serving-auth-cache.integration.test.ts.
 *
 * Deterministic: the R1 roster cap (3 Personas) is read from
 * src/domain/plan.ts, never hardcoded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { R1_PLAN_DEFINITION } from "@/domain/plan";

type Row = Record<string, unknown>;

/**
 * Recording Supabase service-client double. Counts query order and sequential
 * waves with the same semantics as RequestRecorder (a wave is a batch of
 * queries issued while at least one query is still in flight). Returns the
 * fixture rows honoring eq/in/maybeSingle so the real store mapping runs.
 */
interface Recorder {
  tables: Record<string, Row[]>;
  queries: string[];
  waves: number;
}

function recordingClient(rec: Recorder): SupabaseClient {
  let inFlight = 0;
  function makeQuery(table: string) {
    const filters: { kind: "eq" | "in"; column: string; value: unknown }[] = [];
    let single = false;
    const query = {
      select() {
        return this;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return this;
      },
      in(column: string, value: unknown[]) {
        filters.push({ kind: "in", column, value });
        return this;
      },
      maybeSingle() {
        single = true;
        return this;
      },
      then(
        onFulfilled?: (v: { data: unknown; error: null }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        rec.queries.push(table);
        if (inFlight === 0) rec.waves += 1;
        inFlight += 1;
        let rows = rec.tables[table] ?? [];
        for (const f of filters) {
          if (f.kind === "eq") rows = rows.filter((r) => r[f.column] === f.value);
          if (f.kind === "in")
            rows = rows.filter((r) => (f.value as unknown[]).includes(r[f.column]));
        }
        const data = single ? (rows[0] ?? null) : rows;
        return Promise.resolve({ data, error: null }).then(
          (v) => {
            inFlight = Math.max(0, inFlight - 1);
            return onFulfilled ? onFulfilled(v) : v;
          },
          (e) => {
            inFlight = Math.max(0, inFlight - 1);
            return onRejected ? onRejected(e) : Promise.reject(e);
          }
        );
      },
    };
    return query;
  }
  return {
    from: (table: string) => makeQuery(table),
    rpc: async () => ({ data: [], error: null }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Fixture: one Family at the R1 roster cap (3 Personas), with every table
// populated so "hydrated vs skipped" is observable table by table. Built
// inside vi.hoisted because the "@/lib/supabase" mock factory runs before
// module imports resolve (191 pattern).
// ---------------------------------------------------------------------------

const seam = vi.hoisted(() => {
  const NOW = "2026-08-03T00:00:00.000Z";

  function fixtureTables(): Record<string, Row[]> {
    const personas: Row[] = [];
    for (let i = 0; i < 3; i++) {
      personas.push({
        id: `persona-${i}`,
        family_id: "fam-1",
        created_by_member_id: "mem-1",
        kind: i === 0 ? "baby" : "adult",
        display_name: `Persona ${i}`,
        status: "ready",
        lora_weight_key: `lora/fam-1/persona-${i}`,
        avatar_key: `avatars/fam-1/persona-${i}/gen.png`,
        review_sample_keys: [`likeness-samples/fam-1/persona-${i}/g/0.png`],
        likeness_confirmed: true,
        promoted_from_character_id: null,
        questionnaire: {
          name: `Persona ${i}`,
          topics: ["Brave", "Curious"],
          favoriteAnimals: ["cats", "dragons"],
        },
        created_at: NOW,
      });
    }
    return {
      families: [{ id: "fam-1", created_at: NOW }],
      members: [
        {
          id: "mem-1",
          auth_user_id: "auth-1",
          family_id: "fam-1",
          email: "g@example.com",
          role: "guardian",
          self_persona_id: null,
          selected_baby_id: "baby-1",
          jurisdiction: "US",
          created_at: NOW,
        },
      ],
      personas,
      characters: [
        {
          id: "char-1",
          family_id: "fam-1",
          created_by_member_id: "mem-1",
          display_name: "Coco the Cat",
          description: "A curious cat",
          questionnaire: { name: "Coco the Cat", topics: ["Curious"], isFictional: true },
          promoted_persona_id: null,
          created_at: NOW,
        },
      ],
      subscriptions: [
        {
          family_id: "fam-1",
          status: "active",
          stripe_customer_id: "cus_1",
          stripe_subscription_id: "sub_1",
          updated_at: NOW,
        },
      ],
      consent_receipts: [
        {
          id: "receipt-1",
          family_id: "fam-1",
          member_id: "mem-1",
          jurisdiction: "US",
          notice_version: "us-coppa-v1",
          method: "payment_vpc",
          status: "verified",
          expires_at: null,
          consented_at: NOW,
        },
      ],
      light_consent_receipts: [
        {
          id: "light-1",
          character_id: "char-1",
          family_id: "fam-1",
          member_id: "mem-1",
          jurisdiction: "US",
          notice_version: "char-v1",
          attestation: "fictional",
          consented_at: NOW,
        },
      ],
      // The book graph arrives embedded in one storybooks query (read profile).
      storybooks: [
        {
          id: "book-1",
          family_id: "fam-1",
          baby_id: "baby-1",
          created_by_member_id: "mem-1",
          status: "finalized",
          brief: { starringPersonaIds: ["persona-0"], storyType: "bedtime", theme: "Moon" },
          classic_id: null,
          style_bible: null,
          reroll_budget_remaining: 5,
          reroll_credits: 0,
          created_at: NOW,
          finalized_at: NOW,
          pages: [
            {
              id: "page-1",
              storybook_id: "book-1",
              index: 0,
              text: "Goodnight moon.",
              illustration_url: null,
              illustration_blob_key: "books/fam-1/book-1/page-0.png",
              video_blob_key: null,
              video_url: null,
              voice_clip_id: null,
              generation_status: "ready",
              persona_count: 1,
              page_candidates: [
                {
                  id: "cand-1",
                  page_id: "page-1",
                  kind: "illustration",
                  content: "memory://books/fam-1/book-1/page-0.png",
                  selected: true,
                  created_at: NOW,
                },
              ],
            },
          ],
          persisted_generations: [
            {
              storybook_id: "book-1",
              story: { pages: [{ text: "Goodnight moon." }] },
              persisted_at: NOW,
            },
          ],
        },
      ],
      babies: [
        {
          id: "baby-1",
          family_id: "fam-1",
          display_name: "Maya",
          birth_date: "2025-01-01",
          daily_routine: null,
          roster_group_id: "group-1",
          roster_scope: "shared",
          is_default: true,
          created_at: NOW,
          baby_person_bonds: [
            { id: "bond-1", baby_id: "baby-1", persona_id: "persona-1", relationship: "Mom" },
          ],
        },
      ],
      moments: [
        {
          id: "moment-1",
          family_id: "fam-1",
          baby_id: "baby-1",
          created_by_member_id: "mem-1",
          body: "Maya's first steps",
          occurred_on: "2026-08-01",
          is_significant: true,
          moment_type: "milestone",
          created_at: NOW,
          moment_people: [
            { id: "mp-1", moment_id: "moment-1", persona_id: "persona-1", character_id: null },
          ],
        },
      ],
      email_plus_vpc_requests: [],
      fal_training_requests: [
        {
          request_id: "req-1",
          family_id: "fam-1",
          persona_id: "persona-0",
          endpoint: "fal-ai/flux-2/lora",
          model: "flux-2-lora",
          steps: 800,
          idempotency_key: "ik-1",
          status: "completed",
          input_zip_key: null,
          lora_weight_key: "lora/fam-1/persona-0",
          configuration_key: null,
          error: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ],
      // Append-only / worker / write-path tables — must NOT hydrate on reads.
      story_allowance_reservations: [
        { storybook_id: "book-1", family_id: "fam-1", status: "committed", created_at: NOW },
      ],
      provider_cost_ledger: [
        {
          id: "cost-1",
          family_id: "fam-1",
          provider: "fal.ai",
          endpoint: "fal-ai/flux-2/lora",
          model: "flux-2-lora",
          pricing_version: "2026-08-01",
          units: { images: 1 },
          estimated_cost_usd: 0.1,
          actual_cost_usd: 0.1,
          latency_ms: 20,
          request_id: "r-1",
          provider_request_id: "p-1",
          owning_entity_ids: { familyId: "fam-1" },
          attempt_type: "image",
          outcome: "succeeded",
          cost_category: "provider_attempt",
          created_at: NOW,
        },
      ],
      provider_kill_switches: [
        {
          id: "ks-1",
          family_id: "fam-1",
          scope: "endpoint",
          endpoint: "fal-ai/flux-2/lora",
          threshold: "red",
          reason: "test",
          active: true,
          created_at: NOW,
        },
      ],
      moderation_audit: [
        {
          id: "audit-1",
          family_id: "fam-1",
          resource_type: "generated_image",
          resource_id: "book-1/page-0",
          outcome: "allowed",
          reason: null,
          created_at: NOW,
        },
      ],
      text_stories: [
        {
          id: "ts-1",
          family_id: "fam-1",
          created_by_member_id: "mem-1",
          brief: { starringCharacterIds: [], storyType: "bedtime", theme: "stars" },
          text: "Twinkle.",
          created_at: NOW,
        },
      ],
      invites: [],
      pending_briefs: [],
      purge_schedule: [],
      banned_accounts: [],
      push_subscriptions: [],
      journal_nudge_state: [],
      baby_auto_context_watermarks: [],
      fal_webhook_receipts: [],
      story_context_provenance: [],
      share_links: [],
      pages: [
        {
          id: "page-1",
          storybook_id: "book-1",
          index: 0,
          text: "Goodnight moon.",
          illustration_url: null,
          illustration_blob_key: "books/fam-1/book-1/page-0.png",
          video_blob_key: null,
          video_url: null,
          voice_clip_id: null,
          generation_status: "ready",
          persona_count: 1,
        },
      ],
      page_candidates: [
        {
          id: "cand-1",
          page_id: "page-1",
          kind: "illustration",
          content: "memory://x",
          selected: true,
          created_at: NOW,
        },
      ],
      persisted_generations: [
        { storybook_id: "book-1", story: { pages: [{ text: "Goodnight moon." }] }, persisted_at: NOW },
      ],
      baby_person_bonds: [
        { id: "bond-1", baby_id: "baby-1", persona_id: "persona-1", relationship: "Mom" },
      ],
      moment_people: [
        { id: "mp-1", moment_id: "moment-1", persona_id: "persona-1", character_id: null },
      ],
    };
  }

  function makeClient(rec: Recorder): SupabaseClient {
    return recordingClient(rec);
  }

  return { fixtureTables, makeClient };
});

/** Shared per-request query/wave capture for the route-level tests. */
const seamRouteState = vi.hoisted(() => ({ queries: [] as string[], waves: 0 }));

const READ_LEDGER_TABLES = [
  "story_allowance_reservations",
  "provider_cost_ledger",
  "provider_kill_switches",
  "moderation_audit",
  "story_context_provenance",
  "push_subscriptions",
  "journal_nudge_state",
  "baby_auto_context_watermarks",
  "pending_briefs",
  "purge_schedule",
  "fal_webhook_receipts",
  "text_stories",
  "invites",
  "share_links",
];

// ---------------------------------------------------------------------------
// Mocked production seams for the route-level tests (191 pattern): the real
// createRequestContext + SupabaseDataStore run against the recording client,
// so query/wave counting flows through the production hydration code.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () =>
    seam.makeClient({
      tables: seam.fixtureTables(),
      queries: seamRouteState.queries,
      waves: seamRouteState.waves,
    }),
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async () => ({ sub: "auth-1", email: "g@example.com", jurisdiction: "US" }),
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { SupabaseDataStore } from "@/db/supabase-store";
import { createRequestContext } from "@/lib/context";
import { createTestContext, generateAndWait, goodPhoto } from "@/test/fixtures";
import { RequestRecorder } from "@/lib/request-timing";
import type { Member } from "@/domain/types";

const captureCtx: { current?: ReturnType<typeof createRequestContext> } = {};

function bearerRequest(path: string, method = "GET"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { Authorization: "Bearer good" },
  });
}

afterEach(() => {
  seamRouteState.queries = [];
  seamRouteState.waves = 0;
  vi.restoreAllMocks();
});

describe("192 — read-profile hydration scope", () => {
  it("AC-2: the full profile still hydrates every required table (writes/RLS/hard-delete)", async () => {
    expect(R1_PLAN_DEFINITION.limits.personas).toBe(3); // fixture self-check
    const rec: Recorder = { tables: seam.fixtureTables(), queries: [], waves: 0 };
    const store = new SupabaseDataStore(recordingClient(rec));

    const member = await store.hydrateByAuthUser("auth-1", "full");

    expect(member?.id).toBe("mem-1");
    expect(store.personas.size).toBe(R1_PLAN_DEFINITION.limits.personas);
    expect(store.characters.size).toBe(1);
    expect(store.storybooks.get("book-1")?.status).toBe("finalized");
    expect(store.pages.get("page-1")?.illustrationBlobKey).toBe(
      "books/fam-1/book-1/page-0.png"
    );
    expect(store.pageCandidates.get("cand-1")?.selected).toBe(true);
    expect(store.persistedGenerations.get("book-1")).toBeDefined();
    expect(store.momentPeople.get("mp-1")?.personaId).toBe("persona-1");
    // Ledger / worker tables — the full profile must keep them.
    expect(store.storyAllowanceReservations.get("book-1")?.status).toBe("committed");
    expect([...store.providerCostLedgerEntries.keys()]).toContain("cost-1");
    expect([...store.providerKillSwitches.keys()]).toContain("ks-1");
    expect([...store.moderationAudit.keys()]).toContain("audit-1");
    expect(store.textStories.get("ts-1")?.text).toBe("Twinkle.");
    expect([...store.falTrainingRequests.keys()]).toContain("req-1");
    // Every write-path table was queried.
    for (const table of READ_LEDGER_TABLES) {
      expect(rec.queries).toContain(table);
    }
    expect(rec.queries).toContain("pending_briefs");
    expect(rec.queries).toContain("baby_person_bonds");
    expect(rec.queries).toContain("page_candidates");
    expect(rec.queries).toContain("moment_people");
    expect(rec.queries).toContain("persisted_generations");
  });

  it("AC-1: the read profile skips append-only ledgers and hydrates in two sequential waves", async () => {
    const rec: Recorder = { tables: seam.fixtureTables(), queries: [], waves: 0 };
    const store = new SupabaseDataStore(recordingClient(rec));

    const member = await store.hydrateByAuthUser("auth-1", "read");

    expect(member?.id).toBe("mem-1");
    for (const table of READ_LEDGER_TABLES) {
      expect(rec.queries).not.toContain(table);
    }
    expect(store.storyAllowanceReservations.size).toBe(0);
    expect(store.providerCostLedgerEntries.size).toBe(0);
    expect(store.moderationAudit.size).toBe(0);
    expect(store.pendingBriefs.size).toBe(0);
    expect(store.storyContextProvenance.size).toBe(0);
    // Ordinary read data IS hydrated (book graph via one embedded query).
    expect(store.personas.size).toBe(R1_PLAN_DEFINITION.limits.personas);
    expect(store.characters.size).toBe(1);
    expect(store.getSubscription("fam-1")?.status).toBe("active");
    expect(store.getStorybook("book-1", "mem-1")?.status).toBe("finalized");
    expect(store.getPagesForStorybook("book-1")).toHaveLength(1);
    expect(store.getCandidatesForPage("page-1")).toHaveLength(1);
    expect(store.getPersistedGeneration("book-1")).toBeDefined();
    expect(store.getBaby("baby-1", "mem-1")?.displayName).toBe("Maya");
    expect(store.getMomentsForBaby("baby-1", "mem-1")).toHaveLength(1);
    expect(store.getConsentReceiptForFamily("fam-1", "payment_vpc")?.id).toBe("receipt-1");
    // Members lookup wave + single flattened fan-out wave.
    expect(rec.waves).toBe(2);
  });

  it("AC-1: the read profile covers every table the three read endpoints touch", async () => {
    const rec: Recorder = { tables: seam.fixtureTables(), queries: [], waves: 0 };
    const store = new SupabaseDataStore(recordingClient(rec));
    const member = (await store.hydrateByAuthUser("auth-1", "read"))!;

    expect(store.getPersonasByFamily(member.familyId, member.id)).toHaveLength(3);
    expect(store.getCharactersByFamily(member.familyId, member.id)).toHaveLength(1);
    expect(store.listStorybooksForFamily(member.familyId, member.id)).toHaveLength(1);
    expect(store.listStorybooksForBaby("baby-1", member.id)).toHaveLength(1);
    expect(store.getStorybook("book-1", member.id)).toBeDefined();
    expect(store.getPagesForStorybook("book-1")).toHaveLength(1);
    expect(store.getCandidatesForPage("page-1")).toHaveLength(1);
    expect(store.getPersistedGeneration("book-1")).toBeDefined();
  });

  it("image/avatar routes use a minimal authenticated Family lookup (member row only)", async () => {
    const rec: Recorder = { tables: seam.fixtureTables(), queries: [], waves: 0 };
    const store = new SupabaseDataStore(recordingClient(rec));

    const member = await store.hydrateByAuthUser("auth-1", "minimal");

    expect(member?.familyId).toBe("fam-1");
    expect(rec.queries).toEqual(["members"]);
    expect(rec.waves).toBe(1);
    expect(store.families.size).toBe(0);
    expect(store.personas.size).toBe(0);
  });

  it("the default profile stays full for direct callers (backward compatible)", async () => {
    const rec: Recorder = { tables: seam.fixtureTables(), queries: [], waves: 0 };
    const store = new SupabaseDataStore(recordingClient(rec));
    const member = await store.hydrateByAuthUser("auth-1");
    expect(member?.id).toBe("mem-1");
    expect(rec.queries).toContain("story_allowance_reservations");
    expect(store.storyAllowanceReservations.get("book-1")?.status).toBe("committed");
  });
});

describe("192 — authenticated read endpoints use ≤2 sequential read waves", () => {
  async function captureContextFactory() {
    const mod = await import("@/lib/context");
    const realCreateContext = mod.createRequestContext;
    const ctxSpy = vi
      .spyOn(mod, "createRequestContext")
      .mockImplementation((timing?: RequestRecorder) => {
        const ctx = realCreateContext(timing);
        captureCtx.current = ctx;
        return ctx;
      });
    return ctxSpy;
  }

  it("AC-1: GET /api/home uses the read profile — at most two sequential waves", async () => {
    const ctxSpy = await captureContextFactory();
    try {
      const { GET } = await import("@/app/api/home/route");
      const res = await GET(bearerRequest("/api/home"));
      expect(res.status).toBe(200);
      expect(captureCtx.current!.timing.waveCount).toBeLessThanOrEqual(2);
      expect(captureCtx.current!.timing.queryCount).toBeGreaterThan(0);
    } finally {
      ctxSpy.mockRestore();
    }
  });

  it("AC-1: GET /api/storybooks uses the read profile — at most two sequential waves", async () => {
    const ctxSpy = await captureContextFactory();
    try {
      const { GET } = await import("@/app/api/storybooks/route");
      const res = await GET(bearerRequest("/api/storybooks"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { storybooks: unknown[] };
      expect(body.storybooks).toHaveLength(1);
      expect(captureCtx.current!.timing.waveCount).toBeLessThanOrEqual(2);
    } finally {
      ctxSpy.mockRestore();
    }
  });

  it("AC-1: authorized Story detail uses the read profile — at most two sequential waves", async () => {
    const ctxSpy = await captureContextFactory();
    try {
      const { GET } = await import("@/app/api/storybooks/[id]/route");
      const res = await GET(bearerRequest("/api/storybooks/book-1"), {
        params: Promise.resolve({ id: "book-1" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; pages: unknown[] };
      expect(body.id).toBe("book-1");
      expect(captureCtx.current!.timing.waveCount).toBeLessThanOrEqual(2);
    } finally {
      ctxSpy.mockRestore();
    }
  });

  it("AC-3: the Home payload is under 32KB at the R1 roster cap (3 Personas)", async () => {
    const ctxSpy = await captureContextFactory();
    try {
      const { GET } = await import("@/app/api/home/route");
      const res = await GET(bearerRequest("/api/home"));
      expect(res.status).toBe(200);
      const bytes = Buffer.byteLength(await res.text());
      expect(bytes).toBeLessThan(32 * 1024);
    } finally {
      ctxSpy.mockRestore();
    }
  });

  it("AC-3: Story detail is under 500KB with no base64 images or provider artifact keys", async () => {
    // Real 12-page book from the deterministic harness; stub the auth seam
    // (122b pattern) so the route runs against the in-memory store.
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-192", "p@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_192", "sub_192");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const babyPersona = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "192 payload",
    });

    const member: Member = ctx.store.members.get(guardian.id)!;
    const spy = vi
      .spyOn(await import("@/lib/request-auth"), "resolveRequestAuth")
      .mockResolvedValue({ ctx: ctx as never, member });
    try {
      const { GET } = await import("@/app/api/storybooks/[id]/route");
      const res = await GET(bearerRequest(`/api/storybooks/${book.id}`), {
        params: Promise.resolve({ id: book.id }),
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(Buffer.byteLength(body)).toBeLessThan(500 * 1024);
      expect(body).not.toMatch(/data:image\//);
      expect(body).not.toMatch(/;base64,/);
      // Provider artifact keys/URLs never leak into the reader payload.
      expect(body).not.toMatch(/"loraWeightKey"/);
      expect(body).not.toMatch(/"inputZipKey"/);
      expect(body).not.toMatch(/"configurationKey"/);
      expect(body).not.toMatch(/fal\.ai/);
    } finally {
      spy.mockRestore();
    }
  });
});
