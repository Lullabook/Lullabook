import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseDataStore } from "@/db/supabase-store";

/**
 * SupabaseDataStore unit-of-work test against a stub client: hydrate one
 * Family's row graph into the in-memory maps, mutate through the DataStore
 * API, and assert sync() upserts changes and deletes rows that vanished
 * from the maps (children before parents).
 */

type Row = Record<string, unknown>;

interface Recorded {
  upserts: { table: string; rows: Row[] }[];
  deletes: { table: string; column: string; ids: unknown[] }[];
}

function stubClient(tables: Record<string, Row[]>): {
  client: SupabaseClient;
  recorded: Recorded;
} {
  const recorded: Recorded = { upserts: [], deletes: [] };

  function makeQuery(table: string) {
    const filters: { kind: "eq" | "in" | "lte"; column: string; value: unknown }[] = [];
    let single = false;
    let deleting = false;

    function resolveRows(): Row[] {
      let rows = tables[table] ?? [];
      for (const f of filters) {
        if (f.kind === "eq") rows = rows.filter((r) => r[f.column] === f.value);
        if (f.kind === "in")
          rows = rows.filter((r) => (f.value as unknown[]).includes(r[f.column]));
        if (f.kind === "lte")
          rows = rows.filter((r) => String(r[f.column]) <= String(f.value));
      }
      return rows;
    }

    const query = {
      select() {
        return query;
      },
      delete() {
        deleting = true;
        return query;
      },
      upsert(rows: Row | Row[]) {
        recorded.upserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve({ data: null, error: null });
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return query;
      },
      lte(column: string, value: unknown) {
        filters.push({ kind: "lte", column, value });
        return query;
      },
      in(column: string, value: unknown[]) {
        if (deleting) {
          recorded.deletes.push({ table, column, ids: value });
          return Promise.resolve({ data: null, error: null });
        }
        filters.push({ kind: "in", column, value });
        return query;
      },
      maybeSingle() {
        single = true;
        return query;
      },
      then(
        onFulfilled: (v: { data: unknown; error: null }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        const rows = resolveRows();
        const data = single ? (rows[0] ?? null) : rows;
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  const client = {
    from(table: string) {
      return makeQuery(table);
    },
  } as unknown as SupabaseClient;

  return { client, recorded };
}

const NOW = new Date().toISOString();

function fixtureTables(): Record<string, Row[]> {
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
        jurisdiction: "US",
        created_at: NOW,
      },
    ],
    personas: [
      {
        id: "persona-1",
        family_id: "fam-1",
        created_by_member_id: "mem-1",
        kind: "baby",
        display_name: "Maya",
        status: "ready",
        lora_weight_key: "lora/1",
        avatar_key: "avatars/fam-1/persona-1",
        likeness_confirmed: false,
        promoted_from_character_id: null,
        questionnaire: null,
        created_at: NOW,
      },
    ],
    characters: [],
    subscriptions: [],
    consent_receipts: [],
    light_consent_receipts: [],
    storybooks: [
      {
        id: "book-1",
        family_id: "fam-1",
        created_by_member_id: "mem-1",
        status: "finalized",
        brief: { starringPersonaIds: [], storyType: "bedtime", theme: "moon" },
        classic_id: null,
        style_bible: null,
        reroll_budget_remaining: 5,
        reroll_credits: 0,
        created_at: NOW,
        finalized_at: NOW,
      },
    ],
    story_allowance_reservations: [
      {
        storybook_id: "book-1",
        family_id: "fam-1",
        status: "committed",
        created_at: NOW,
        released_at: null,
        release_reason: null,
      },
    ],
    pages: [
      {
        id: "page-1",
        storybook_id: "book-1",
        index: 0,
        text: "Goodnight moon.",
        illustration_url: null,
        illustration_blob_key: "books/fam-1/book-1/page-0.png",
        generation_status: "ready",
        persona_count: 1,
      },
    ],
    page_candidates: [],
    persisted_generations: [],
    share_links: [],
    text_stories: [],
    invites: [],
    pending_briefs: [],
    purge_schedule: [],
    banned_accounts: [],
  };
}

describe("SupabaseDataStore", () => {
  it("hydrates a Family's row graph into the in-memory maps", async () => {
    const { client } = stubClient(fixtureTables());
    const store = new SupabaseDataStore(client);

    const member = await store.hydrateByAuthUser("auth-1");

    expect(member?.id).toBe("mem-1");
    expect(store.families.has("fam-1")).toBe(true);
    expect(store.storybooks.get("book-1")?.brief.theme).toBe("moon");
    expect(store.pages.get("page-1")?.illustrationBlobKey).toBe(
      "books/fam-1/book-1/page-0.png"
    );
    expect(store.storyAllowanceReservations.get("book-1")?.status).toBe("committed");
    // RLS-equivalent read path still works against hydrated state.
    expect(store.getStorybook("book-1", "mem-1")?.status).toBe("finalized");
  });

  it("sync() upserts live rows and deletes rows removed from the maps", async () => {
    const { client, recorded } = stubClient(fixtureTables());
    const store = new SupabaseDataStore(client);
    await store.hydrateByAuthUser("auth-1");

    // Mutate through the DataStore seam: one new row, one removal.
    store.saveTextStory({
      id: "story-1",
      familyId: "fam-1",
      createdByMemberId: "mem-1",
      brief: { starringCharacterIds: [], storyType: "bedtime", theme: "stars" },
      text: "Twinkle.",
      createdAt: new Date(),
    });
    store.pages.delete("page-1");
    const allowance = store.storyAllowanceReservations.get("book-1")!;
    allowance.status = "released";
    allowance.releasedAt = new Date("2026-07-28T12:00:00.000Z");
    allowance.releaseReason = "story_text_generation_failed";
    store.storyAllowanceReservations.set("book-1", allowance);

    await store.sync();

    const textUpsert = recorded.upserts.find((u) => u.table === "text_stories");
    expect(textUpsert?.rows[0].id).toBe("story-1");

    const pageDelete = recorded.deletes.find((d) => d.table === "pages");
    expect(pageDelete?.ids).toEqual(["page-1"]);
    const allowanceUpsert = recorded.upserts.find(
      (u) => u.table === "story_allowance_reservations"
    );
    expect(allowanceUpsert?.rows[0]).toMatchObject({
      storybook_id: "book-1",
      status: "released",
      release_reason: "story_text_generation_failed",
    });

    // Children delete before parents: pages before storybooks in call order.
    const tablesDeleted = recorded.deletes.map((d) => d.table);
    expect(tablesDeleted.indexOf("pages")).toBeLessThan(
      tablesDeleted.includes("storybooks")
        ? tablesDeleted.indexOf("storybooks")
        : Infinity
    );

    // Untouched rows are upserted idempotently, never deleted.
    expect(recorded.deletes.find((d) => d.table === "members")).toBeUndefined();
  });

  it("hydrateFamily is idempotent per request", async () => {
    const tables = fixtureTables();
    const { client } = stubClient(tables);
    const store = new SupabaseDataStore(client);

    await store.hydrateFamily("fam-1");
    tables.storybooks.push({ ...tables.storybooks[0], id: "book-2" });
    await store.hydrateFamily("fam-1"); // second call is a no-op

    expect(store.storybooks.has("book-2")).toBe(false);
  });

  it("persists likeness_confirmed across the Supabase round-trip (issue 125)", async () => {
    // Regression for the red-team BUG 1: the likeness-confirmation gate must
    // survive hydrate → mutate → sync → re-hydrate. A field not in the upsert
    // payload (or not read on hydrate) silently makes the gate a no-op in prod.
    const tables = fixtureTables();
    const { client, recorded } = stubClient(tables);
    const store = new SupabaseDataStore(client);
    await store.hydrateByAuthUser("auth-1");

    // Hydrated persona starts unconfirmed.
    expect(store.personas.get("persona-1")?.likenessConfirmed).toBe(false);

    // Confirm likeness through the service seam.
    const persona = store.personas.get("persona-1")!;
    persona.likenessConfirmed = true;
    store.savePersona(persona);

    await store.sync();

    // The upsert payload carries the column.
    const personaUpsert = recorded.upserts.find((u) => u.table === "personas");
    expect(personaUpsert?.rows[0].likeness_confirmed).toBe(true);

    // Re-hydrate from the (stubbed) persisted state — the field survives.
    const store2 = new SupabaseDataStore(
      stubClient({
        ...tables,
        personas: [{ ...tables.personas[0], likeness_confirmed: true }],
      }).client
    );
    await store2.hydrateByAuthUser("auth-1");
    expect(store2.personas.get("persona-1")?.likenessConfirmed).toBe(true);
  });

  it("hydrates persisted_generations embedded as a single object (1:1 PK embed)", async () => {
    // PostgREST embeds persisted_generations as ONE object (its storybook_id
    // is the PRIMARY KEY), or null — never an array. Regression: the old
    // `for (const gr of (r.persisted_generations ?? []))` crashed with
    // "object is not iterable" on any storybook that had a persisted story.
    const tables = fixtureTables();
    tables.storybooks[0] = {
      ...tables.storybooks[0],
      persisted_generations: {
        storybook_id: "book-1",
        story: { text: "Goodnight moon." },
        persisted_at: "2026-08-07T12:00:00.000Z",
      },
    };
    const { client } = stubClient(tables);
    const store = new SupabaseDataStore(client);

    const member = await store.hydrateByAuthUser("auth-1", "read");

    expect(member?.id).toBe("mem-1");
    expect(store.persistedGenerations.get("book-1")?.story).toEqual({
      text: "Goodnight moon.",
    });
  });
});
