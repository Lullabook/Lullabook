import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RlsViolationError } from "@/db/store";
import { SupabaseDataStore } from "@/db/supabase-store";
import { InMemoryPushSubscriptionStore } from "@/adapters/push-store";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { FakeNotifications } from "@/adapters/fakes";
import { createTestContext } from "@/test/fixtures";

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

function fixtureWithPushAndVpc(): Record<string, Row[]> {
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
        jurisdiction: "US_IOS",
        created_at: NOW,
      },
      {
        id: "mem-2",
        auth_user_id: "auth-2",
        family_id: "fam-1",
        email: "m@example.com",
        role: "member",
        self_persona_id: null,
        jurisdiction: "US_IOS",
        created_at: NOW,
      },
    ],
    personas: [],
    characters: [],
    subscriptions: [],
    consent_receipts: [],
    light_consent_receipts: [],
    storybooks: [],
    pages: [],
    page_candidates: [],
    persisted_generations: [],
    share_links: [],
    text_stories: [],
    invites: [],
    pending_briefs: [],
    purge_schedule: [],
    banned_accounts: [],
    push_subscriptions: [
      {
        id: "push-1",
        member_id: "mem-1",
        expo_push_token: "ExponentPushToken[a]",
        created_at: NOW,
      },
      {
        id: "push-2",
        member_id: "mem-2",
        expo_push_token: "ExponentPushToken[b]",
        created_at: NOW,
      },
    ],
    email_plus_vpc_requests: [
      {
        id: "vpc-1",
        family_id: "fam-1",
        member_id: "mem-1",
        email: "g@example.com",
        status: "link_sent",
        token: "secret-token",
        notice_version: "us-coppa-v1",
        requested_at: NOW,
        confirmed_at: null,
      },
    ],
  };
}

describe("32 — persist push_subscriptions + email_plus_vpc_requests", () => {
  it("enforces member-scoped push — Member cannot read another Member's tokens", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-g", "g@example.com");
    const member = ctx.store.createMember({
      authUserId: "auth-m",
      familyId: guardian.familyId,
      email: "m@example.com",
      role: "member",
      selfPersonaId: null,
      selectedBabyId: null,
      jurisdiction: "US",
    });
    ctx.store.pushSubscriptions.set("ps-g", {
      id: "ps-g",
      memberId: guardian.id,
      expoPushToken: "ExponentPushToken[g]",
      createdAt: new Date(),
    });
    ctx.store.pushSubscriptions.set("ps-m", {
      id: "ps-m",
      memberId: member.id,
      expoPushToken: "ExponentPushToken[m]",
      createdAt: new Date(),
    });

    expect(ctx.store.getPushSubscriptionsForMember(guardian.id, guardian.id)).toHaveLength(1);
    expect(() => ctx.store.getPushSubscriptionsForMember(member.id, guardian.id)).toThrow(
      RlsViolationError
    );
  });

  it("exposes VPC requests within Family without the secret token", () => {
    const ctx = createTestContext();
    const memberA = ctx.onboarding.ensureFamilyForNewUser("auth-a", "a@example.com", "US_IOS");
    const memberB = ctx.onboarding.ensureFamilyForNewUser("auth-b", "b@example.com", "US_IOS");
    const notifications = new FakeNotifications();
    const vpc = new EmailPlusVpcService(ctx.store, notifications, "http://localhost:3000");
    const req = vpc.requestConsent(memberA.id, "a@example.com");
    vpc.sendConsentLink(req.id);

    const visible = ctx.store.getEmailPlusVpcRequestsForFamily(memberA.familyId, memberA.id);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe(req.id);
    expect(visible[0]).not.toHaveProperty("token");

    expect(() =>
      ctx.store.getEmailPlusVpcRequestsForFamily(memberA.familyId, memberB.id)
    ).toThrow(RlsViolationError);
  });

  it("SupabaseDataStore hydrates and sync()s push + VPC rows", async () => {
    const { client, recorded } = stubClient(fixtureWithPushAndVpc());
    const store = new SupabaseDataStore(client);
    await store.hydrateByAuthUser("auth-1");

    expect(store.pushSubscriptions.size).toBe(2);
    expect(store.emailPlusVpcRequests.get("vpc-1")?.token).toBe("secret-token");

    store.pushSubscriptions.delete("push-2");
    store.emailPlusVpcRequests.set("vpc-1", {
      ...store.emailPlusVpcRequests.get("vpc-1")!,
      status: "confirmed",
      confirmedAt: new Date(),
    });

    await store.sync();

    const pushDelete = recorded.deletes.find((d) => d.table === "push_subscriptions");
    expect(pushDelete?.ids).toEqual(["push-2"]);

    const vpcUpsert = recorded.upserts.find((u) => u.table === "email_plus_vpc_requests");
    expect(vpcUpsert?.rows[0].status).toBe("confirmed");
  });

  it("hard-delete sync deletes push + VPC and does not re-upsert them", async () => {
    const { client, recorded } = stubClient(fixtureWithPushAndVpc());
    const store = new SupabaseDataStore(client);
    await store.hydrateByAuthUser("auth-1");

    store.hardDeleteFamily("fam-1");
    await store.sync();

    const pushDelete = recorded.deletes.find((d) => d.table === "push_subscriptions");
    const vpcDelete = recorded.deletes.find((d) => d.table === "email_plus_vpc_requests");
    expect(pushDelete?.ids.sort()).toEqual(["push-1", "push-2"]);
    expect(vpcDelete?.ids).toEqual(["vpc-1"]);

    recorded.upserts.length = 0;
    await store.sync();
    expect(recorded.upserts.find((u) => u.table === "push_subscriptions")).toBeUndefined();
    expect(recorded.upserts.find((u) => u.table === "email_plus_vpc_requests")).toBeUndefined();
  });

  it("registers push tokens through the adapter into the store maps", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-push32", "push32@example.com");
    const push = new InMemoryPushSubscriptionStore(ctx.store);
    await push.registerToken(guardian.id, "ExponentPushToken[abc]");
    expect(ctx.store.pushSubscriptions.size).toBe(1);
  });
});
