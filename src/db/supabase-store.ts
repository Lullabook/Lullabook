import type { SupabaseClient } from "@supabase/supabase-js";
import { DataStore } from "@/db/store";
import type {
  Character,
  ConsentReceipt,
  Family,
  LightConsentReceipt,
  Member,
  Page,
  PageCandidate,
  PendingBrief,
  PersistedGeneration,
  Persona,
  ShareLink,
  Storybook,
  Subscription,
  TextStory,
  PushSubscription,
  EmailPlusVpcRequest,
} from "@/domain/types";

/**
 * DECISION: SupabaseDataStore keeps the synchronous DataStore shape the
 * services (and 87 tests) depend on by working as a per-request unit of work:
 *
 *   1. `hydrateFamily()` loads one Family's whole row graph into the
 *      in-memory maps (RLS in Postgres is the hard boundary; the in-memory
 *      store's own RLS checks remain as defense-in-depth).
 *   2. The domain services run unchanged against the maps.
 *   3. `sync()` diffs the maps against the hydration snapshot and upserts /
 *      deletes through the service-role client.
 *
 * One family per request and a single writer per family is assumed — correct
 * for v1's request shapes, and the workflow's per-Page steps each run their
 * own hydrate→run→sync cycle so replays stay upsert-idempotent.
 */
// Supabase rows arrive untyped (no generated DB types in v1); every hydrate
// loop maps snake_case columns into a domain shape immediately, so the loose
// row type never escapes this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export class SupabaseDataStore extends DataStore {
  /** (table, id) pairs that existed at hydration time, for delete detection. */
  private snapshot = new Map<string, Set<string>>();
  private hydratedFamilyIds = new Set<string>();

  constructor(private readonly client: SupabaseClient) {
    super();
  }

  private snap(table: string, id: string): void {
    if (!this.snapshot.has(table)) this.snapshot.set(table, new Set());
    this.snapshot.get(table)!.add(id);
  }

  // -------------------------------------------------------------------------
  // Hydration
  // -------------------------------------------------------------------------

  async hydrateByAuthUser(authUserId: string): Promise<Member | undefined> {
    const { data, error } = await this.client
      .from("members")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw new Error(`hydrateByAuthUser failed: ${error.message}`);
    if (!data) return undefined;
    await this.hydrateFamily(data.family_id as string);
    return this.getMemberByAuthUserId(authUserId);
  }

  async hydrateByMemberId(memberId: string): Promise<void> {
    const { data, error } = await this.client
      .from("members")
      .select("family_id")
      .eq("id", memberId)
      .maybeSingle();
    if (error) throw new Error(`hydrateByMemberId failed: ${error.message}`);
    if (data) await this.hydrateFamily(data.family_id as string);
  }

  async hydrateByShareToken(token: string): Promise<void> {
    const { data: link, error } = await this.client
      .from("share_links")
      .select("*, storybooks(family_id)")
      .eq("token", token)
      .maybeSingle();
    if (error) throw new Error(`hydrateByShareToken failed: ${error.message}`);
    const familyId = (link?.storybooks as { family_id?: string } | null)?.family_id;
    if (familyId) await this.hydrateFamily(familyId);
  }

  async hydrateInvite(inviteId: string): Promise<void> {
    const { data, error } = await this.client
      .from("invites")
      .select("family_id")
      .eq("id", inviteId)
      .maybeSingle();
    if (error) throw new Error(`hydrateInvite failed: ${error.message}`);
    if (data) await this.hydrateFamily(data.family_id as string);
  }

  /** Family ids whose purge window has elapsed (for the scheduled purge). */
  async listPurgeDueFamilyIds(now = new Date()): Promise<string[]> {
    const { data, error } = await this.client
      .from("purge_schedule")
      .select("family_id")
      .lte("purge_at", now.toISOString());
    if (error) throw new Error(`listPurgeDueFamilyIds failed: ${error.message}`);
    return (data ?? []).map((r) => r.family_id as string);
  }

  async hydrateFamily(familyId: string): Promise<void> {
    if (this.hydratedFamilyIds.has(familyId)) return;
    this.hydratedFamilyIds.add(familyId);

    const q = <T = Row>(table: string, column = "family_id") =>
      this.client.from(table).select("*").eq(column, familyId) as unknown as Promise<{
        data: T[] | null;
        error: { message: string } | null;
      }>;

    const [
      families,
      members,
      personas,
      characters,
      subscriptions,
      consentReceipts,
      lightReceipts,
      storybooks,
      textStories,
      invites,
      pendingBriefsRes,
      purgeRows,
      banned,
      emailPlusVpcRequests,
      babiesRes,
      bondsRes,
      momentsRes,
    ] = await Promise.all([
      this.client.from("families").select("*").eq("id", familyId),
      q("members"),
      q("personas"),
      q("characters"),
      q("subscriptions"),
      q("consent_receipts"),
      q("light_consent_receipts"),
      q("storybooks"),
      q("text_stories"),
      q("invites"),
      this.client
        .from("pending_briefs")
        .select("*, members!inner(family_id)")
        .eq("members.family_id", familyId),
      q("purge_schedule"),
      this.client.from("banned_accounts").select("account_id"),
      q("email_plus_vpc_requests"),
      q("babies"),
      this.client.from("baby_person_bonds").select("*, babies!inner(family_id)").eq("babies.family_id", familyId),
      q("moments"),
    ]);

    for (const res of [
      families,
      members,
      personas,
      characters,
      subscriptions,
      consentReceipts,
      lightReceipts,
      storybooks,
      textStories,
      invites,
      pendingBriefsRes,
      purgeRows,
      banned,
      emailPlusVpcRequests,
      babiesRes,
      bondsRes,
      momentsRes,
    ]) {
      if (res.error) {
        const msg = res.error.message;
        if (msg.includes("Could not find the table")) {
          throw new Error(
            `${msg} — your Supabase project is missing newer tables. Open Supabase Dashboard → SQL Editor, paste and run CONTEXT/local-dev/schema-incremental-004-007.sql, then refresh.`
          );
        }
        throw new Error(`hydrateFamily failed: ${msg}`);
      }
    }

    for (const r of (families.data ?? []) as Row[]) {
      const family: Family = { id: r.id, createdAt: new Date(r.created_at) };
      this.families.set(family.id, family);
      this.snap("families", family.id);
    }
    for (const r of members.data ?? []) {
      const member: Member = {
        id: r.id,
        authUserId: r.auth_user_id,
        familyId: r.family_id,
        email: r.email,
        role: r.role,
        selfPersonaId: r.self_persona_id,
        selectedBabyId: r.selected_baby_id ?? null,
        jurisdiction: r.jurisdiction,
        createdAt: new Date(r.created_at),
      };
      this.members.set(member.id, member);
      this.snap("members", member.id);
    }
    for (const r of personas.data ?? []) {
      const persona: Persona = {
        id: r.id,
        familyId: r.family_id,
        createdByMemberId: r.created_by_member_id,
        kind: r.kind,
        displayName: r.display_name,
        status: r.status,
        loraWeightKey: r.lora_weight_key,
        avatarKey: r.avatar_key ?? null,
        promotedFromCharacterId: r.promoted_from_character_id ?? undefined,
        questionnaire: r.questionnaire ?? undefined,
        createdAt: new Date(r.created_at),
      };
      this.personas.set(persona.id, persona);
      this.snap("personas", persona.id);
    }
    for (const r of characters.data ?? []) {
      const character: Character = {
        id: r.id,
        familyId: r.family_id,
        createdByMemberId: r.created_by_member_id,
        displayName: r.display_name,
        description: r.description ?? "",
        questionnaire: r.questionnaire,
        promotedPersonaId: r.promoted_persona_id ?? undefined,
        createdAt: new Date(r.created_at),
      };
      this.characters.set(character.id, character);
      this.snap("characters", character.id);
    }
    for (const r of subscriptions.data ?? []) {
      const sub: Subscription = {
        familyId: r.family_id,
        status: r.status,
        stripeCustomerId: r.stripe_customer_id,
        stripeSubscriptionId: r.stripe_subscription_id,
        updatedAt: new Date(r.updated_at),
      };
      this.subscriptions.set(sub.familyId, sub);
      this.snap("subscriptions", sub.familyId);
    }
    for (const r of consentReceipts.data ?? []) {
      const receipt: ConsentReceipt = {
        id: r.id,
        familyId: r.family_id,
        memberId: r.member_id,
        jurisdiction: r.jurisdiction,
        noticeVersion: r.notice_version,
        consentedAt: new Date(r.consented_at),
      };
      this.consentReceipts.set(receipt.id, receipt);
      this.snap("consent_receipts", receipt.id);
    }
    for (const r of lightReceipts.data ?? []) {
      const receipt: LightConsentReceipt = {
        id: r.id,
        characterId: r.character_id,
        familyId: r.family_id,
        memberId: r.member_id,
        jurisdiction: r.jurisdiction,
        noticeVersion: r.notice_version,
        attestation: r.attestation,
        consentedAt: new Date(r.consented_at),
      };
      this.lightConsentReceipts.set(receipt.id, receipt);
      this.snap("light_consent_receipts", receipt.id);
    }
    for (const r of textStories.data ?? []) {
      const story: TextStory = {
        id: r.id,
        familyId: r.family_id,
        createdByMemberId: r.created_by_member_id,
        brief: r.brief,
        text: r.text,
        createdAt: new Date(r.created_at),
      };
      this.textStories.set(story.id, story);
      this.snap("text_stories", story.id);
    }
    for (const r of invites.data ?? []) {
      this.invites.set(r.id, {
        id: r.id,
        familyId: r.family_id,
        email: r.email,
        invitedBy: r.invited_by,
      });
      this.snap("invites", r.id);
    }
    for (const r of (pendingBriefsRes.data ?? []) as Row[]) {
      const pending: PendingBrief = {
        memberId: r.member_id,
        personaId: r.persona_id,
        brief: r.brief,
        submittedAt: new Date(r.submitted_at),
      };
      this.pendingBriefs.set(r.key, pending);
      this.snap("pending_briefs", r.key);
    }
    for (const r of purgeRows.data ?? []) {
      this.purgeScheduled.set(r.family_id, {
        familyId: r.family_id,
        purgeAt: new Date(r.purge_at),
      });
      this.snap("purge_schedule", r.family_id);
    }
    for (const r of (banned.data ?? []) as Row[]) {
      this.bannedAccounts.add(r.account_id);
      this.snap("banned_accounts", r.account_id);
    }
    for (const r of emailPlusVpcRequests.data ?? []) {
      const request: EmailPlusVpcRequest = {
        id: r.id,
        familyId: r.family_id,
        memberId: r.member_id,
        email: r.email,
        status: r.status,
        token: r.token,
        noticeVersion: r.notice_version,
        requestedAt: new Date(r.requested_at),
        confirmedAt: r.confirmed_at ? new Date(r.confirmed_at) : undefined,
      };
      this.emailPlusVpcRequests.set(request.id, request);
      this.snap("email_plus_vpc_requests", request.id);
    }
    for (const r of babiesRes.data ?? []) {
      const baby: import("@/domain/types").Baby = {
        id: r.id,
        familyId: r.family_id,
        displayName: r.display_name,
        birthDate: r.birth_date ? String(r.birth_date).slice(0, 10) : null,
        dailyRoutine: Array.isArray(r.daily_routine)
          ? (r.daily_routine as import("@/domain/daily-types").RoutineEntry[])
          : null,
        rosterGroupId: r.roster_group_id,
        rosterScope: r.roster_scope,
        isDefault: r.is_default,
        createdAt: new Date(r.created_at),
      };
      this.babies.set(baby.id, baby);
      this.snap("babies", baby.id);
    }
    for (const r of bondsRes.data ?? []) {
      const bond: import("@/domain/types").BabyPersonBond = {
        id: r.id,
        babyId: r.baby_id,
        personaId: r.persona_id,
        relationship: r.relationship,
        babyCallsThem: r.baby_calls_them,
        theyCallBaby: r.they_call_baby,
      };
      this.babyPersonBonds.set(bond.id, bond);
      this.snap("baby_person_bonds", bond.id);
    }
    for (const r of momentsRes.data ?? []) {
      const moment: import("@/domain/types").Moment = {
        id: r.id,
        familyId: r.family_id,
        babyId: r.baby_id,
        createdByMemberId: r.created_by_member_id,
        body: r.body,
        occurredOn: String(r.occurred_on).slice(0, 10),
        isSignificant: r.is_significant,
        momentType: r.moment_type,
        createdAt: new Date(r.created_at),
      };
      this.moments.set(moment.id, moment);
      this.snap("moments", moment.id);
    }

    const familyMomentIds = [...this.moments.values()]
      .filter((m) => m.familyId === familyId)
      .map((m) => m.id);
    if (familyMomentIds.length > 0) {
      const mpRes = await this.client
        .from("moment_people")
        .select("*")
        .in("moment_id", familyMomentIds);
      if (mpRes.error) throw new Error(`hydrateFamily failed: ${mpRes.error.message}`);
      for (const r of (mpRes.data ?? []) as Row[]) {
        const link: import("@/domain/types").MomentPersonLink = {
          id: r.id,
          momentId: r.moment_id,
          personaId: r.persona_id ?? undefined,
          characterId: r.character_id ?? undefined,
        };
        this.momentPeople.set(link.id, link);
        this.snap("moment_people", link.id);
      }
    }

    const familyBabyIds = [...this.babies.values()]
      .filter((b) => b.familyId === familyId)
      .map((b) => b.id);
    if (familyBabyIds.length > 0) {
      const wmRes = await this.client
        .from("baby_auto_context_watermarks")
        .select("*")
        .in("baby_id", familyBabyIds);
      if (wmRes.error) throw new Error(`hydrateFamily failed: ${wmRes.error.message}`);
      for (const r of (wmRes.data ?? []) as Row[]) {
        const wm: import("@/domain/types").BabyAutoContextWatermark = {
          babyId: r.baby_id,
          lastStoryAt: r.last_story_at ? new Date(r.last_story_at) : null,
        };
        this.autoContextWatermarks.set(wm.babyId, wm);
        this.snap("baby_auto_context_watermarks", wm.babyId);
      }
    }

    const memberIds = (members.data ?? []).map((r) => r.id as string);
    if (memberIds.length > 0) {
      const pushRes = await this.client
        .from("push_subscriptions")
        .select("*")
        .in("member_id", memberIds);
      if (pushRes.error) throw new Error(`hydrateFamily failed: ${pushRes.error.message}`);
      for (const r of (pushRes.data ?? []) as Row[]) {
        const sub: PushSubscription = {
          id: r.id,
          memberId: r.member_id,
          expoPushToken: r.expo_push_token,
          createdAt: new Date(r.created_at),
        };
        this.pushSubscriptions.set(sub.id, sub);
        this.snap("push_subscriptions", sub.id);
      }

      if (familyBabyIds.length > 0) {
        const nudgeRes = await this.client
          .from("journal_nudge_state")
          .select("*")
          .in("member_id", memberIds)
          .in("baby_id", familyBabyIds);
        if (nudgeRes.error) throw new Error(`hydrateFamily failed: ${nudgeRes.error.message}`);
        for (const r of (nudgeRes.data ?? []) as Row[]) {
          const state: import("@/domain/types").JournalNudgeState = {
            id: r.id,
            memberId: r.member_id,
            babyId: r.baby_id,
            kind: r.kind,
            suppressedOn: String(r.suppressed_on).slice(0, 10),
            createdAt: new Date(r.created_at),
          };
          this.journalNudgeStates.set(state.id, state);
          this.snap("journal_nudge_state", state.id);
        }
      }
    }

    const bookIds = (storybooks.data ?? []).map((r) => r.id as string);
    for (const r of storybooks.data ?? []) {
      const book: Storybook = {
        id: r.id,
        familyId: r.family_id,
        createdByMemberId: r.created_by_member_id,
        status: r.status,
        brief: r.brief,
        classicId: r.classic_id ?? undefined,
        styleBible: r.style_bible,
        rerollBudgetRemaining: r.reroll_budget_remaining,
        rerollCredits: r.reroll_credits,
        createdAt: new Date(r.created_at),
        finalizedAt: r.finalized_at ? new Date(r.finalized_at) : null,
      };
      this.storybooks.set(book.id, book);
      this.snap("storybooks", book.id);
    }

    if (bookIds.length > 0) {
      const [pagesRes, generationsRes, linksRes] = await Promise.all([
        this.client.from("pages").select("*").in("storybook_id", bookIds),
        this.client.from("persisted_generations").select("*").in("storybook_id", bookIds),
        this.client.from("share_links").select("*").in("storybook_id", bookIds),
      ]);
      for (const res of [pagesRes, generationsRes, linksRes]) {
        if (res.error) throw new Error(`hydrateFamily failed: ${res.error.message}`);
      }

      const pageIds: string[] = [];
      for (const r of (pagesRes.data ?? []) as Row[]) {
        const page: Page = {
          id: r.id,
          storybookId: r.storybook_id,
          index: r.index,
          text: r.text,
          illustrationUrl: r.illustration_url,
          illustrationBlobKey: r.illustration_blob_key,
          videoBlobKey: r.video_blob_key ?? null,
          videoUrl: r.video_url ?? null,
          voiceClipId: r.voice_clip_id ?? null,
          generationStatus: r.generation_status,
          personaCount: r.persona_count,
        };
        this.pages.set(page.id, page);
        this.snap("pages", page.id);
        pageIds.push(page.id);
      }
      for (const r of (generationsRes.data ?? []) as Row[]) {
        const generation: PersistedGeneration = {
          storybookId: r.storybook_id,
          story: r.story,
          persistedAt: new Date(r.persisted_at),
        };
        this.persistedGenerations.set(generation.storybookId, generation);
        this.snap("persisted_generations", generation.storybookId);
      }
      for (const r of (linksRes.data ?? []) as Row[]) {
        const link: ShareLink = {
          id: r.id,
          storybookId: r.storybook_id,
          token: r.token,
          expiresAt: r.expires_at ? new Date(r.expires_at) : null,
          passcodeHash: r.passcode_hash,
          revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
          createdAt: new Date(r.created_at),
        };
        this.shareLinks.set(link.id, link);
        this.snap("share_links", link.id);
      }

      if (pageIds.length > 0) {
        const candidatesRes = await this.client
          .from("page_candidates")
          .select("*")
          .in("page_id", pageIds);
        if (candidatesRes.error) {
          throw new Error(`hydrateFamily failed: ${candidatesRes.error.message}`);
        }
        for (const r of (candidatesRes.data ?? []) as Row[]) {
          const candidate: PageCandidate = {
            id: r.id,
            pageId: r.page_id,
            kind: r.kind,
            content: r.content,
            selected: r.selected,
            createdAt: new Date(r.created_at),
          };
          this.pageCandidates.set(candidate.id, candidate);
          this.snap("page_candidates", candidate.id);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync-back
  // -------------------------------------------------------------------------

  /** Persist every in-memory change since hydration back to Postgres. */
  async sync(): Promise<void> {
    const upsert = async (
      table: string,
      rows: Record<string, unknown>[],
      conflict = "id"
    ) => {
      if (rows.length === 0) return;
      const { error } = await this.client.from(table).upsert(rows, { onConflict: conflict });
      if (error) throw new Error(`sync upsert ${table} failed: ${error.message}`);
    };
    const deleteMissing = async (table: string, presentIds: Set<string>, column = "id") => {
      const snapped = this.snapshot.get(table);
      if (!snapped) return;
      const gone = [...snapped].filter((id) => !presentIds.has(id));
      if (gone.length === 0) return;
      const { error } = await this.client.from(table).delete().in(column, gone);
      if (error) throw new Error(`sync delete ${table} failed: ${error.message}`);
    };

    // Upserts run sequentially in FK-dependency order (parents before
    // children) — Postgres enforces the foreign keys the in-memory fakes do
    // not, so a concurrent Promise.all races child rows ahead of their parent.
    const upsertOps: Array<() => Promise<void>> = [
      () => upsert(
        "families",
        [...this.families.values()].map((f) => ({
          id: f.id,
          created_at: f.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "members",
        [...this.members.values()].map((m) => ({
          id: m.id,
          auth_user_id: m.authUserId,
          family_id: m.familyId,
          email: m.email,
          role: m.role,
          self_persona_id: m.selfPersonaId,
          selected_baby_id: m.selectedBabyId,
          jurisdiction: m.jurisdiction,
          created_at: m.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "personas",
        [...this.personas.values()].map((p) => ({
          id: p.id,
          family_id: p.familyId,
          created_by_member_id: p.createdByMemberId,
          kind: p.kind,
          display_name: p.displayName,
          status: p.status,
          lora_weight_key: p.loraWeightKey,
          avatar_key: p.avatarKey,
          promoted_from_character_id: p.promotedFromCharacterId ?? null,
          questionnaire: p.questionnaire ?? null,
          created_at: p.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "characters",
        [...this.characters.values()].map((c) => ({
          id: c.id,
          family_id: c.familyId,
          created_by_member_id: c.createdByMemberId,
          display_name: c.displayName,
          description: c.description ?? "",
          questionnaire: c.questionnaire,
          promoted_persona_id: c.promotedPersonaId ?? null,
          created_at: c.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "subscriptions",
        [...this.subscriptions.values()].map((s) => ({
          family_id: s.familyId,
          status: s.status,
          stripe_customer_id: s.stripeCustomerId,
          stripe_subscription_id: s.stripeSubscriptionId,
          updated_at: s.updatedAt.toISOString(),
        })),
        "family_id"
      ),
      () => upsert(
        "consent_receipts",
        [...this.consentReceipts.values()].map((r) => ({
          id: r.id,
          family_id: r.familyId,
          member_id: r.memberId,
          jurisdiction: r.jurisdiction,
          notice_version: r.noticeVersion,
          consented_at: r.consentedAt.toISOString(),
        }))
      ),
      () => upsert(
        "light_consent_receipts",
        [...this.lightConsentReceipts.values()].map((r) => ({
          id: r.id,
          character_id: r.characterId,
          family_id: r.familyId,
          member_id: r.memberId,
          jurisdiction: r.jurisdiction,
          notice_version: r.noticeVersion,
          attestation: r.attestation,
          consented_at: r.consentedAt.toISOString(),
        }))
      ),
      () => upsert(
        "babies",
        [...this.babies.values()].map((b) => ({
          id: b.id,
          family_id: b.familyId,
          display_name: b.displayName,
          birth_date: b.birthDate,
          daily_routine: b.dailyRoutine,
          roster_group_id: b.rosterGroupId,
          roster_scope: b.rosterScope,
          is_default: b.isDefault,
          created_at: b.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "baby_person_bonds",
        [...this.babyPersonBonds.values()].map((b) => ({
          id: b.id,
          baby_id: b.babyId,
          persona_id: b.personaId,
          relationship: b.relationship,
          baby_calls_them: b.babyCallsThem,
          they_call_baby: b.theyCallBaby,
        }))
      ),
      () => upsert(
        "moments",
        [...this.moments.values()].map((m) => ({
          id: m.id,
          family_id: m.familyId,
          baby_id: m.babyId,
          created_by_member_id: m.createdByMemberId,
          body: m.body,
          occurred_on: m.occurredOn,
          is_significant: m.isSignificant,
          moment_type: m.momentType,
          created_at: m.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "moment_people",
        [...this.momentPeople.values()].map((l) => ({
          id: l.id,
          moment_id: l.momentId,
          persona_id: l.personaId ?? null,
          character_id: l.characterId ?? null,
        }))
      ),
      () => upsert(
        "baby_auto_context_watermarks",
        [...this.autoContextWatermarks.values()].map((w) => ({
          baby_id: w.babyId,
          last_story_at: w.lastStoryAt?.toISOString() ?? null,
        })),
        "baby_id"
      ),
      () => upsert(
        "journal_nudge_state",
        [...this.journalNudgeStates.values()].map((s) => ({
          id: s.id,
          member_id: s.memberId,
          baby_id: s.babyId,
          kind: s.kind,
          suppressed_on: s.suppressedOn,
          created_at: s.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "storybooks",
        [...this.storybooks.values()].map((b) => ({
          id: b.id,
          family_id: b.familyId,
          created_by_member_id: b.createdByMemberId,
          status: b.status,
          brief: b.brief,
          classic_id: b.classicId ?? null,
          style_bible: b.styleBible,
          reroll_budget_remaining: b.rerollBudgetRemaining,
          reroll_credits: b.rerollCredits,
          created_at: b.createdAt.toISOString(),
          finalized_at: b.finalizedAt?.toISOString() ?? null,
        }))
      ),
      () => upsert(
        "pages",
        [...this.pages.values()].map((p) => ({
          id: p.id,
          storybook_id: p.storybookId,
          index: p.index,
          text: p.text,
          illustration_url: p.illustrationUrl,
          illustration_blob_key: p.illustrationBlobKey,
          generation_status: p.generationStatus,
          persona_count: p.personaCount,
        }))
      ),
      () => upsert(
        "page_candidates",
        [...this.pageCandidates.values()].map((c) => ({
          id: c.id,
          page_id: c.pageId,
          kind: c.kind,
          content: c.content,
          selected: c.selected,
          created_at: c.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "persisted_generations",
        [...this.persistedGenerations.values()].map((g) => ({
          storybook_id: g.storybookId,
          story: g.story,
          persisted_at: g.persistedAt.toISOString(),
        })),
        "storybook_id"
      ),
      () => upsert(
        "text_stories",
        [...this.textStories.values()].map((s) => ({
          id: s.id,
          family_id: s.familyId,
          created_by_member_id: s.createdByMemberId,
          brief: s.brief,
          text: s.text,
          created_at: s.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "share_links",
        [...this.shareLinks.values()].map((l) => ({
          id: l.id,
          storybook_id: l.storybookId,
          token: l.token,
          expires_at: l.expiresAt?.toISOString() ?? null,
          passcode_hash: l.passcodeHash,
          revoked_at: l.revokedAt?.toISOString() ?? null,
          created_at: l.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "moderation_audit",
        [...this.moderationAudit.values()].map((e) => ({
          id: e.id,
          resource_type: e.resourceType,
          resource_id: e.resourceId,
          outcome: e.outcome,
          reason: e.reason,
          created_at: e.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "invites",
        [...this.invites.values()].map((i) => ({
          id: i.id,
          family_id: i.familyId,
          email: i.email,
          invited_by: i.invitedBy,
        }))
      ),
      () => upsert(
        "pending_briefs",
        [...this.pendingBriefs.entries()].map(([key, p]) => ({
          key,
          member_id: p.memberId,
          persona_id: p.personaId,
          brief: p.brief,
          submitted_at: p.submittedAt.toISOString(),
        })),
        "key"
      ),
      () => upsert(
        "purge_schedule",
        [...this.purgeScheduled.values()].map((p) => ({
          family_id: p.familyId,
          purge_at: p.purgeAt.toISOString(),
        })),
        "family_id"
      ),
      () => upsert(
        "banned_accounts",
        [...this.bannedAccounts].map((accountId) => ({ account_id: accountId })),
        "account_id"
      ),
      () => upsert(
        "push_subscriptions",
        [...this.pushSubscriptions.values()].map((s) => ({
          id: s.id,
          member_id: s.memberId,
          expo_push_token: s.expoPushToken,
          created_at: s.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "email_plus_vpc_requests",
        [...this.emailPlusVpcRequests.values()].map((r) => ({
          id: r.id,
          family_id: r.familyId,
          member_id: r.memberId,
          email: r.email,
          status: r.status,
          token: r.token,
          notice_version: r.noticeVersion,
          requested_at: r.requestedAt.toISOString(),
          confirmed_at: r.confirmedAt?.toISOString() ?? null,
        }))
      ),
    ];
    for (const op of upsertOps) await op();

    // Deletes run sequentially child-first for the same reason.
    const deleteOps: Array<() => Promise<void>> = [
      () => deleteMissing("page_candidates", new Set(this.pageCandidates.keys())),
      () => deleteMissing("pages", new Set(this.pages.keys())),
      () => deleteMissing("moments", new Set(this.moments.keys())),
      () => deleteMissing("moment_people", new Set(this.momentPeople.keys())),
      () => deleteMissing(
        "baby_auto_context_watermarks",
        new Set(this.autoContextWatermarks.keys()),
        "baby_id"
      ),
      () => deleteMissing("journal_nudge_state", new Set(this.journalNudgeStates.keys())),
      () => deleteMissing(
        "persisted_generations",
        new Set(this.persistedGenerations.keys()),
        "storybook_id"
      ),
      () => deleteMissing("share_links", new Set(this.shareLinks.keys())),
      () => deleteMissing("text_stories", new Set(this.textStories.keys())),
      () => deleteMissing("storybooks", new Set(this.storybooks.keys())),
      () => deleteMissing("baby_person_bonds", new Set(this.babyPersonBonds.keys())),
      () => deleteMissing("babies", new Set(this.babies.keys())),
      () => deleteMissing("light_consent_receipts", new Set(this.lightConsentReceipts.keys())),
      () => deleteMissing("consent_receipts", new Set(this.consentReceipts.keys())),
      () => deleteMissing("invites", new Set(this.invites.keys())),
      () => deleteMissing("pending_briefs", new Set(this.pendingBriefs.keys()), "key"),
      () => deleteMissing("purge_schedule", new Set(this.purgeScheduled.keys()), "family_id"),
      () => deleteMissing("subscriptions", new Set(this.subscriptions.keys()), "family_id"),
      () => deleteMissing("characters", new Set(this.characters.keys())),
      () => deleteMissing("personas", new Set(this.personas.keys())),
      () => deleteMissing("members", new Set(this.members.keys())),
      () => deleteMissing("families", new Set(this.families.keys())),
      () => deleteMissing("moderation_audit", new Set(this.moderationAudit.keys())),
      () => deleteMissing("push_subscriptions", new Set(this.pushSubscriptions.keys())),
      () => deleteMissing("email_plus_vpc_requests", new Set(this.emailPlusVpcRequests.keys())),
    ];
    for (const op of deleteOps) await op();
  }
}
