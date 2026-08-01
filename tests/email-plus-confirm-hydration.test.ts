/**
 * Email-Plus VPC confirm — production hydration (ADR-0008 / ADR-0018).
 *
 * Live-audit finding (2026-07-31): `POST /api/consent/email-plus/confirm`
 * built a fresh `createRequestContext()` and called `confirmConsent(token)`
 * straight away. That context's `SupabaseDataStore` starts EMPTY and the
 * route never hydrated it, so `confirmConsent` scanned an empty
 * `emailPlusVpcRequests` map and always threw "Invalid or expired consent
 * link". Reproduced against the running dev server: request → 200
 * `link_sent`, confirm with the stored token → 400.
 *
 * Consequence: Email-Plus is the REQUIRED consent method on iOS (Apple IAP
 * cannot prove payer identity), so no Family could ever reach
 * `consent_verified`, and `requireConsentVerified` blocked every Baby Persona
 * creation. The whole R1 entry flow (demo → signup → trial → consent →
 * photos) dead-ended at consent.
 *
 * The gate below pins both halves: the store can resolve a Family from a
 * consent token, and the production route actually calls it before
 * confirming.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDataStore } from "@/db/supabase-store";

const TOKEN = "consent-token-abc";
const FAMILY_ID = "fam-1";
const MEMBER_ID = "mem-1";

function emptyTables(): Record<string, Record<string, unknown>[]> {
  return {
    families: [{ id: FAMILY_ID, created_at: new Date().toISOString() }],
    members: [
      {
        id: MEMBER_ID,
        auth_user_id: "auth-1",
        family_id: FAMILY_ID,
        email: "guardian@example.com",
        role: "guardian",
        self_persona_id: null,
        selected_baby_id: null,
        jurisdiction: "US_IOS",
        created_at: new Date().toISOString(),
      },
    ],
    personas: [],
    characters: [],
    subscriptions: [],
    consent_receipts: [],
    light_consent_receipts: [],
    storybooks: [],
    text_stories: [],
    invites: [],
    pending_briefs: [],
    purge_schedule: [],
    banned_accounts: [],
    babies: [],
    baby_person_bonds: [],
    moments: [],
    email_plus_vpc_requests: [
      {
        id: "vpc-1",
        family_id: FAMILY_ID,
        member_id: MEMBER_ID,
        email: "guardian@example.com",
        status: "link_sent",
        token: TOKEN,
        notice_version: "us-coppa-v1",
        requested_at: new Date().toISOString(),
        confirmed_at: null,
      },
    ],
  };
}

describe("Email-Plus confirm — the consent link must resolve its Family", () => {
  it("hydrates the Family that owns a consent token", async () => {
    const store = new SupabaseDataStore(createStubClient(emptyTables()));

    expect(store.emailPlusVpcRequests.size).toBe(0); // starts empty, as in production
    await store.hydrateByConsentToken(TOKEN);

    // The request the confirm route needs is now loadable by token.
    const loaded = [...store.emailPlusVpcRequests.values()].find((r) => r.token === TOKEN);
    expect(loaded).toBeDefined();
    expect(loaded?.familyId).toBe(FAMILY_ID);
    // …and so is the Member whose jurisdiction stamps the receipt.
    expect(store.members.get(MEMBER_ID)?.jurisdiction).toBe("US_IOS");
  });

  it("an unknown token hydrates nothing and does not throw", async () => {
    const store = new SupabaseDataStore(createStubClient(emptyTables()));
    await expect(store.hydrateByConsentToken("not-a-real-token")).resolves.toBeUndefined();
    expect(store.emailPlusVpcRequests.size).toBe(0);
  });

  it("the production confirm route hydrates before it confirms", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/consent/email-plus/confirm/route.ts"),
      "utf8",
    );
    const hydrateAt = src.indexOf("hydrateByConsentToken");
    const confirmAt = src.indexOf("confirmConsent");
    expect(hydrateAt).toBeGreaterThan(-1);
    expect(confirmAt).toBeGreaterThan(-1);
    expect(hydrateAt).toBeLessThan(confirmAt);
  });
});

function createStubClient(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      let single = false;
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        in() {
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        upsert() {
          return Promise.resolve({ data: null, error: null });
        },
        then(
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (error: unknown) => unknown,
        ) {
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
