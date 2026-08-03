import type { SupabaseClient } from "@supabase/supabase-js";
import { DataStore, type HydrationProfile, type PendingBriefClaimResult } from "@/db/store";
import type {
  Character,
  ConsentReceipt,
  Family,
  LightConsentReceipt,
  Member,
  ModerationAuditEntry,
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
import type { FalTrainingRequestRecord, FalWebhookReceipt } from "@/adapters/types";
import type {
  ProviderCostLedgerEntry,
  ProviderKillSwitch,
} from "@/services/provider-cost-metering";

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

  async hydrateByAuthUser(
    authUserId: string,
    profile: HydrationProfile = "full"
  ): Promise<Member | undefined> {
    const { data, error } = await this.client
      .from("members")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw new Error(`hydrateByAuthUser failed: ${error.message}`);
    if (!data) return undefined;
    if (profile === "minimal") {
      // Image/avatar routes only need the Member's Family boundary for the
      // blob-key prefix check — no Family graph, one query.
      const member = this.toMember(data as Row);
      this.members.set(member.id, member);
      this.snap("members", member.id);
      return member;
    }
    await this.hydrateFamily(data.family_id as string, profile);
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

  /**
   * Resolve the Family that owns an Email-Plus consent link. The confirm
   * endpoint is unauthenticated by design — the Guardian clicks a link from
   * their inbox, carrying only the token — so the token is the ONLY handle
   * onto the Family. Without this the store stays empty and every confirm
   * fails closed as "Invalid or expired consent link" (ADR-0008/ADR-0018).
   * An unknown token hydrates nothing; the caller still fails closed.
   */
  async hydrateByConsentToken(token: string): Promise<void> {
    const { data, error } = await this.client
      .from("email_plus_vpc_requests")
      .select("family_id")
      .eq("token", token)
      .maybeSingle();
    if (error) throw new Error(`hydrateByConsentToken failed: ${error.message}`);
    if (data) await this.hydrateFamily(data.family_id as string);
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

  /** Atomically claims and terminates stranded generation rows in PostgreSQL. */
  async reapStrandedStorybookGenerations(
    now: Date,
    budgetMs: number,
    limit = 25
  ): Promise<number> {
    const { data, error } = await this.client.rpc("app_reap_stranded_storybook_generations", {
      p_now: now.toISOString(),
      p_budget_ms: budgetMs,
      p_limit: limit,
    });
    if (error) throw new Error(`reapStrandedStorybookGenerations failed: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      const book = this.storybooks.get(row.storybook_id);
      if (book) {
        book.status = row.terminal_status;
        this.storybooks.set(book.id, book);
      }
      const reservation = this.storyAllowanceReservations.get(row.storybook_id);
      if (reservation && row.allowance_status) {
        reservation.status = row.allowance_status;
        reservation.releasedAt = row.released_at ? new Date(row.released_at) : undefined;
        reservation.releaseReason = row.release_reason ?? undefined;
        this.storyAllowanceReservations.set(reservation.storybookId, reservation);
      }
    }
    return (data ?? []).length;
  }

  override async claimPendingBrief(
    key: string,
    claimToken: string,
    now: Date,
    leaseExpiresAt: Date
  ): Promise<PendingBriefClaimResult> {
    const expected = this.pendingBriefs.get(key);
    if (!expected) throw new Error("Pending Brief is missing");
    const { data, error } = await this.client.rpc("app_claim_pending_brief", {
      p_key: key,
      p_claim_token: claimToken,
      p_now: now.toISOString(),
      p_lease_expires_at: leaseExpiresAt.toISOString(),
    });
    if (error) throw new Error(`claimPendingBrief failed: ${error.message}`);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("claimPendingBrief returned an invalid row");
    }
    const row = data as Row;
    if (
      row.key !== key ||
      row.member_id !== expected.memberId ||
      row.persona_id !== expected.personaId
    ) {
      throw new Error("claimPendingBrief returned a mismatched Family-owned row");
    }
    const selectedPersonaIds = Array.isArray(row.selected_persona_ids)
      ? row.selected_persona_ids.filter((id): id is string => typeof id === "string")
      : [];
    const pending: PendingBrief = {
      memberId: row.member_id,
      personaId: row.persona_id,
      brief: row.brief,
      submittedAt: new Date(row.submitted_at),
      selectedPersonaIds:
        selectedPersonaIds.length > 0 ? selectedPersonaIds : [row.persona_id],
      status: row.status ?? "pending",
      claimToken: row.claim_token ?? undefined,
      claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at) : undefined,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : undefined,
      storybookId: row.storybook_id ?? undefined,
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
      failedAt: row.failed_at ? new Date(row.failed_at) : undefined,
      error: row.error ?? undefined,
    };
    this.pendingBriefs.set(key, pending);
    return { pending, claimedNow: row.claimed_now === true };
  }

  async hydrateFamily(familyId: string, profile: HydrationProfile = "full"): Promise<void> {
    if (this.hydratedFamilyIds.has(familyId)) return;
    this.hydratedFamilyIds.add(familyId);
    if (profile === "read") {
      await this.hydrateFamilyRead(familyId);
      return;
    }

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
      allowanceReservations,
      textStories,
      invites,
      pendingBriefsRes,
      purgeRows,
      banned,
      emailPlusVpcRequests,
      babiesRes,
      bondsRes,
      momentsRes,
      falTrainingRequestsRes,
      falWebhookReceiptsRes,
      storyContextProvenanceRes,
      providerCostLedgerRes,
      providerKillSwitchesRes,
      moderationAuditRes,
    ] = await Promise.all([
      this.client.from("families").select("*").eq("id", familyId),
      q("members"),
      q("personas"),
      q("characters"),
      q("subscriptions"),
      q("consent_receipts"),
      q("light_consent_receipts"),
      q("storybooks"),
      q("story_allowance_reservations"),
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
      q("fal_training_requests"),
      q("fal_webhook_receipts"),
      q("story_context_provenance"),
      q("provider_cost_ledger"),
      // Global controls are intentionally visible to every Family; filter
      // Family-scoped rows below before they enter this unit of work.
      this.client.from("provider_kill_switches").select("*"),
      q("moderation_audit"),
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
      allowanceReservations,
      textStories,
      invites,
      pendingBriefsRes,
      purgeRows,
      banned,
      emailPlusVpcRequests,
      babiesRes,
      bondsRes,
      momentsRes,
      falTrainingRequestsRes,
      falWebhookReceiptsRes,
      storyContextProvenanceRes,
      providerCostLedgerRes,
      providerKillSwitchesRes,
      moderationAuditRes,
    ]) {
      if (res.error) {
        const msg = res.error.message;
        if (msg.includes("Could not find the table")) {
          throw new Error(
            `${msg} — your Supabase project is missing newer tables. Open Supabase Dashboard → SQL Editor, then paste and run the migrations in supabase/migrations/ that your project has not applied yet, in order. Then refresh.`
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
        // Generated review derivatives are family-owned keys, never raw photos.
        reviewSampleKeys: Array.isArray(r.review_sample_keys)
          ? r.review_sample_keys.filter((key): key is string => typeof key === "string")
          : [],
        // Issue 125: persisted likeness-confirmation gate.
        likenessConfirmed: r.likeness_confirmed ?? false,
        failureReason: r.failure_reason ?? undefined,
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
        method: r.method ?? undefined,
        status: r.status ?? "verified",
        expiresAt: r.expires_at ? new Date(r.expires_at) : null,
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
        token: r.token ?? "",
        role: "member",
        status: (r.status as "pending" | "accepted" | "expired") ?? "pending",
        createdAt: new Date(r.created_at ?? Date.now()),
        expiresAt: new Date(r.expires_at ?? Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: r.accepted_at ? new Date(r.accepted_at) : null,
        acceptedByAuthUserId: r.accepted_by_auth_user_id ?? null,
      });
      this.snap("invites", r.id);
    }
    for (const r of (pendingBriefsRes.data ?? []) as Row[]) {
      const hydratedSelectedPersonaIds = Array.isArray(r.selected_persona_ids)
        ? r.selected_persona_ids.filter((id): id is string => typeof id === "string")
        : [];
      const pending: PendingBrief = {
        memberId: r.member_id,
        personaId: r.persona_id,
        brief: r.brief,
        submittedAt: new Date(r.submitted_at),
        selectedPersonaIds:
          hydratedSelectedPersonaIds.length > 0
            ? hydratedSelectedPersonaIds
            : [r.persona_id],
        status: r.status ?? "pending",
        claimToken: r.claim_token ?? undefined,
        claimExpiresAt: r.claim_expires_at ? new Date(r.claim_expires_at) : undefined,
        claimedAt: r.claimed_at ? new Date(r.claimed_at) : undefined,
        storybookId: r.storybook_id ?? undefined,
        acceptedAt: r.accepted_at ? new Date(r.accepted_at) : undefined,
        failedAt: r.failed_at ? new Date(r.failed_at) : undefined,
        error: r.error ?? undefined,
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
    for (const r of falTrainingRequestsRes.data ?? []) {
      const request: FalTrainingRequestRecord = {
        requestId: r.request_id,
        familyId: r.family_id,
        personaId: r.persona_id,
        endpoint: r.endpoint,
        model: r.model,
        steps: r.steps,
        idempotencyKey: r.idempotency_key,
        status: r.status,
        inputZipKey: r.input_zip_key ?? undefined,
        loraWeightKey: r.lora_weight_key ?? undefined,
        configurationKey: r.configuration_key ?? undefined,
        error: r.error ?? undefined,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      };
      this.falTrainingRequests.set(request.requestId, request);
      this.snap("fal_training_requests", request.requestId);
    }
    for (const r of falWebhookReceiptsRes.data ?? []) {
      const receipt: FalWebhookReceipt = {
        requestId: r.request_id,
        fingerprint: r.fingerprint,
        receivedAt: new Date(r.received_at),
        status: r.status ?? "completed",
        leaseExpiresAt: r.lease_expires_at ? new Date(r.lease_expires_at) : undefined,
      };
      this.falWebhookReceipts.set(receipt.fingerprint, receipt);
      this.snap("fal_webhook_receipts", receipt.fingerprint);
    }
    for (const r of storyContextProvenanceRes.data ?? []) {
      const provenance = {
        id: r.id as string,
        familyId: r.family_id as string,
        storybookId: r.storybook_id as string,
        babyId: (r.baby_id as string | null) ?? undefined,
        personaIds: Array.isArray(r.persona_ids) ? r.persona_ids.filter((id): id is string => typeof id === "string") : [],
        momentIds: Array.isArray(r.moment_ids) ? r.moment_ids.filter((id): id is string => typeof id === "string") : [],
        firstCount: Number(r.first_count ?? 0),
        pastStorySummaryIncluded: Boolean(r.past_story_summary_included),
        photoDescriptionCount: Number(r.photo_description_count ?? 0),
        tokenEstimate: Number(r.token_estimate ?? 0),
      };
      this.storyContextProvenance.set(provenance.id, provenance);
      const book = this.storybooks.get(provenance.storybookId);
      if (book && provenance.babyId) {
        book.sourceManifest = {
          familyId: provenance.familyId,
          babyId: provenance.babyId,
          personaIds: [...provenance.personaIds],
          momentIds: [...provenance.momentIds],
          firstCount: provenance.firstCount,
          pastStorySummaryIncluded: provenance.pastStorySummaryIncluded,
          photoDescriptionCount: provenance.photoDescriptionCount,
          tokenEstimate: provenance.tokenEstimate,
        };
      }
      this.snap("story_context_provenance", provenance.id);
    }
    for (const r of providerCostLedgerRes.data ?? []) {
      const owner = r.owning_entity_ids as Record<string, unknown>;
      const entry: ProviderCostLedgerEntry = {
        id: r.id as string,
        provider: r.provider as string,
        endpoint: r.endpoint as string,
        model: r.model as string,
        pricingVersion: r.pricing_version as string,
        units: (r.units ?? {}) as Record<string, number>,
        estimatedCostUsd: Number(r.estimated_cost_usd),
        actualCostUsd: r.actual_cost_usd === null ? null : Number(r.actual_cost_usd),
        latencyMs: Number(r.latency_ms),
        requestId: r.request_id as string,
        providerRequestId: r.provider_request_id as string,
        owningEntityIds: {
          familyId: r.family_id as string,
          ...(typeof owner?.personaId === "string" ? { personaId: owner.personaId } : {}),
          ...(typeof owner?.storybookId === "string" ? { storybookId: owner.storybookId } : {}),
          ...(typeof owner?.pageId === "string" ? { pageId: owner.pageId } : {}),
        },
        attemptType: r.attempt_type as ProviderCostLedgerEntry["attemptType"],
        outcome: r.outcome as ProviderCostLedgerEntry["outcome"],
        costCategory: r.cost_category as ProviderCostLedgerEntry["costCategory"],
        createdAt: new Date(r.created_at),
      };
      this.providerCostLedgerEntries.set(entry.id, entry);
      this.snap("provider_cost_ledger", entry.id);
    }
    for (const r of providerKillSwitchesRes.data ?? []) {
      if (r.family_id && r.family_id !== familyId) continue;
      const killSwitch: ProviderKillSwitch = {
        id: r.id as string,
        ...(r.family_id ? { familyId: r.family_id as string } : {}),
        scope: r.scope as ProviderKillSwitch["scope"],
        ...(r.provider ? { provider: r.provider as string } : {}),
        ...(r.model ? { model: r.model as string } : {}),
        ...(r.endpoint ? { endpoint: r.endpoint as string } : {}),
        threshold: r.threshold as ProviderKillSwitch["threshold"],
        reason: r.reason as string,
        createdAt: new Date(r.created_at),
        active: Boolean(r.active),
      };
      this.providerKillSwitches.set(killSwitch.id, killSwitch);
      this.snap("provider_kill_switches", killSwitch.id);
    }
    for (const r of moderationAuditRes.data ?? []) {
      const entry: ModerationAuditEntry = {
        id: r.id as string,
        familyId: r.family_id as string,
        resourceType: r.resource_type as string,
        resourceId: r.resource_id as string,
        outcome: r.outcome as ModerationAuditEntry["outcome"],
        reason: (r.reason as string | null) ?? null,
        createdAt: new Date(r.created_at),
      };
      this.moderationAudit.set(entry.id, entry);
      this.snap("moderation_audit", entry.id);
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
        babyId: r.baby_id ?? undefined,
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
    for (const r of allowanceReservations.data ?? []) {
      this.storyAllowanceReservations.set(r.storybook_id, {
        storybookId: r.storybook_id,
        familyId: r.family_id,
        status: r.status,
        createdAt: new Date(r.created_at),
        releasedAt: r.released_at ? new Date(r.released_at) : undefined,
        releaseReason: r.release_reason ?? undefined,
      });
      this.snap("story_allowance_reservations", r.storybook_id);
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
  // Read-profile hydration (issue 192)
  //
  // Ordinary authenticated reads (GET) hydrate a single flattened wave that
  // skips append-only ledgers and worker registers; the book graph arrives
  // embedded in one storybooks query. The full profile above stays the
  // write/RLS/Hard-delete hydration that inventories every table.
  // -------------------------------------------------------------------------

  private async hydrateFamilyRead(familyId: string): Promise<void> {
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
      storybooksRes,
      babiesRes,
      momentsRes,
      emailPlusVpcRequestsRes,
      falTrainingRequestsRes,
    ] = await Promise.all([
      this.client.from("families").select("*").eq("id", familyId),
      q("members"),
      q("personas"),
      q("characters"),
      q("subscriptions"),
      q("consent_receipts"),
      q("light_consent_receipts"),
      // Book graph in ONE query: pages + page_candidates + persisted text.
      this.client
        .from("storybooks")
        .select("*, pages(*, page_candidates(*)), persisted_generations(*)")
        .eq("family_id", familyId),
      this.client
        .from("babies")
        .select("*, baby_person_bonds(*)")
        .eq("family_id", familyId),
      this.client
        .from("moments")
        .select("*, moment_people(*)")
        .eq("family_id", familyId),
      q("email_plus_vpc_requests"),
      q("fal_training_requests"),
    ]);

    for (const res of [
      families,
      members,
      personas,
      characters,
      subscriptions,
      consentReceipts,
      lightReceipts,
      storybooksRes,
      babiesRes,
      momentsRes,
      emailPlusVpcRequestsRes,
      falTrainingRequestsRes,
    ]) {
      if (res.error) {
        const msg = res.error.message;
        if (msg.includes("Could not find the table")) {
          throw new Error(
            `${msg} — your Supabase project is missing newer tables. Open Supabase Dashboard → SQL Editor, then paste and run the migrations in supabase/migrations/ that your project has not applied yet, in order. Then refresh.`
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
    for (const r of (members.data ?? []) as Row[]) {
      const member = this.toMember(r);
      this.members.set(member.id, member);
      this.snap("members", member.id);
    }
    for (const r of (personas.data ?? []) as Row[]) {
      const persona = this.toPersona(r);
      this.personas.set(persona.id, persona);
      this.snap("personas", persona.id);
    }
    for (const r of (characters.data ?? []) as Row[]) {
      const character = this.toCharacter(r);
      this.characters.set(character.id, character);
      this.snap("characters", character.id);
    }
    for (const r of (subscriptions.data ?? []) as Row[]) {
      const sub = this.toSubscription(r);
      this.subscriptions.set(sub.familyId, sub);
      this.snap("subscriptions", sub.familyId);
    }
    for (const r of (consentReceipts.data ?? []) as Row[]) {
      const receipt = this.toConsentReceipt(r);
      this.consentReceipts.set(receipt.id, receipt);
      this.snap("consent_receipts", receipt.id);
    }
    for (const r of (lightReceipts.data ?? []) as Row[]) {
      const receipt = this.toLightConsentReceipt(r);
      this.lightConsentReceipts.set(receipt.id, receipt);
      this.snap("light_consent_receipts", receipt.id);
    }
    for (const r of (storybooksRes.data ?? []) as Row[]) {
      const book = this.toStorybook(r);
      this.storybooks.set(book.id, book);
      this.snap("storybooks", book.id);
      for (const pr of (r.pages ?? []) as Row[]) {
        const page = this.toPage(pr);
        this.pages.set(page.id, page);
        this.snap("pages", page.id);
        for (const cr of (pr.page_candidates ?? []) as Row[]) {
          const candidate = this.toPageCandidate(cr);
          this.pageCandidates.set(candidate.id, candidate);
          this.snap("page_candidates", candidate.id);
        }
      }
      for (const gr of (r.persisted_generations ?? []) as Row[]) {
        const generation: PersistedGeneration = {
          storybookId: gr.storybook_id,
          story: gr.story,
          persistedAt: new Date(gr.persisted_at),
        };
        this.persistedGenerations.set(generation.storybookId, generation);
        this.snap("persisted_generations", generation.storybookId);
      }
    }
    for (const r of (babiesRes.data ?? []) as Row[]) {
      const baby = this.toBaby(r);
      this.babies.set(baby.id, baby);
      this.snap("babies", baby.id);
      for (const br of (r.baby_person_bonds ?? []) as Row[]) {
        const bond = this.toBond(br);
        this.babyPersonBonds.set(bond.id, bond);
        this.snap("baby_person_bonds", bond.id);
      }
    }
    for (const r of (momentsRes.data ?? []) as Row[]) {
      const moment = this.toMoment(r);
      this.moments.set(moment.id, moment);
      this.snap("moments", moment.id);
      for (const lr of (r.moment_people ?? []) as Row[]) {
        const link = this.toMomentPersonLink(lr);
        this.momentPeople.set(link.id, link);
        this.snap("moment_people", link.id);
      }
    }
    for (const r of (emailPlusVpcRequestsRes.data ?? []) as Row[]) {
      const request = this.toEmailPlusVpcRequest(r);
      this.emailPlusVpcRequests.set(request.id, request);
      this.snap("email_plus_vpc_requests", request.id);
    }
    for (const r of (falTrainingRequestsRes.data ?? []) as Row[]) {
      const request = this.toFalTrainingRequest(r);
      this.falTrainingRequests.set(request.requestId, request);
      this.snap("fal_training_requests", request.requestId);
    }
  }

  // Row → domain converters shared by the read profile and the minimal
  // member lookup. The full profile keeps its inline mapping loops; these
  // converters mirror the same column→field contract (issue 192).

  private toMember(r: Row): Member {
    return {
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
  }

  private toPersona(r: Row): Persona {
    return {
      id: r.id,
      familyId: r.family_id,
      createdByMemberId: r.created_by_member_id,
      kind: r.kind,
      displayName: r.display_name,
      status: r.status,
      loraWeightKey: r.lora_weight_key,
      avatarKey: r.avatar_key ?? null,
      reviewSampleKeys: Array.isArray(r.review_sample_keys)
        ? r.review_sample_keys.filter((key): key is string => typeof key === "string")
        : [],
      likenessConfirmed: r.likeness_confirmed ?? false,
      failureReason: r.failure_reason ?? undefined,
      promotedFromCharacterId: r.promoted_from_character_id ?? undefined,
      questionnaire: r.questionnaire ?? undefined,
      createdAt: new Date(r.created_at),
    };
  }

  private toCharacter(r: Row): Character {
    return {
      id: r.id,
      familyId: r.family_id,
      createdByMemberId: r.created_by_member_id,
      displayName: r.display_name,
      description: r.description ?? "",
      questionnaire: r.questionnaire,
      promotedPersonaId: r.promoted_persona_id ?? undefined,
      createdAt: new Date(r.created_at),
    };
  }

  private toSubscription(r: Row): Subscription {
    return {
      familyId: r.family_id,
      status: r.status,
      stripeCustomerId: r.stripe_customer_id,
      stripeSubscriptionId: r.stripe_subscription_id,
      updatedAt: new Date(r.updated_at),
    };
  }

  private toConsentReceipt(r: Row): ConsentReceipt {
    return {
      id: r.id,
      familyId: r.family_id,
      memberId: r.member_id,
      jurisdiction: r.jurisdiction,
      noticeVersion: r.notice_version,
      method: r.method ?? undefined,
      status: r.status ?? "verified",
      expiresAt: r.expires_at ? new Date(r.expires_at) : null,
      consentedAt: new Date(r.consented_at),
    };
  }

  private toLightConsentReceipt(r: Row): LightConsentReceipt {
    return {
      id: r.id,
      characterId: r.character_id,
      familyId: r.family_id,
      memberId: r.member_id,
      jurisdiction: r.jurisdiction,
      noticeVersion: r.notice_version,
      attestation: r.attestation,
      consentedAt: new Date(r.consented_at),
    };
  }

  private toStorybook(r: Row): Storybook {
    return {
      id: r.id,
      familyId: r.family_id,
      babyId: r.baby_id ?? undefined,
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
  }

  private toPage(r: Row): Page {
    return {
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
  }

  private toPageCandidate(r: Row): PageCandidate {
    return {
      id: r.id,
      pageId: r.page_id,
      kind: r.kind,
      content: r.content,
      selected: r.selected,
      createdAt: new Date(r.created_at),
    };
  }

  private toBaby(r: Row): import("@/domain/types").Baby {
    return {
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
  }

  private toBond(r: Row): import("@/domain/types").BabyPersonBond {
    return {
      id: r.id,
      babyId: r.baby_id,
      personaId: r.persona_id,
      relationship: r.relationship,
      babyCallsThem: r.baby_calls_them,
      theyCallBaby: r.they_call_baby,
    };
  }

  private toMoment(r: Row): import("@/domain/types").Moment {
    return {
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
  }

  private toMomentPersonLink(r: Row): import("@/domain/types").MomentPersonLink {
    return {
      id: r.id,
      momentId: r.moment_id,
      personaId: r.persona_id ?? undefined,
      characterId: r.character_id ?? undefined,
    };
  }

  private toEmailPlusVpcRequest(r: Row): EmailPlusVpcRequest {
    return {
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
  }

  private toFalTrainingRequest(r: Row): FalTrainingRequestRecord {
    return {
      requestId: r.request_id,
      familyId: r.family_id,
      personaId: r.persona_id,
      endpoint: r.endpoint,
      model: r.model,
      steps: r.steps,
      idempotencyKey: r.idempotency_key,
      status: r.status,
      inputZipKey: r.input_zip_key ?? undefined,
      loraWeightKey: r.lora_weight_key ?? undefined,
      configurationKey: r.configuration_key ?? undefined,
      error: r.error ?? undefined,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    };
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
          review_sample_keys: p.reviewSampleKeys ?? [],
          // Issue 125: persisted likeness-confirmation gate.
          likeness_confirmed: p.likenessConfirmed ?? false,
          failure_reason: p.failureReason ?? null,
          promoted_from_character_id: p.promotedFromCharacterId ?? null,
          questionnaire: p.questionnaire ?? null,
          created_at: p.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "fal_training_requests",
        [...this.falTrainingRequests.values()].map((request) => ({
          request_id: request.requestId,
          family_id: request.familyId,
          persona_id: request.personaId,
          endpoint: request.endpoint,
          model: request.model,
          steps: request.steps,
          idempotency_key: request.idempotencyKey,
          status: request.status,
          input_zip_key: request.inputZipKey ?? null,
          lora_weight_key: request.loraWeightKey ?? null,
          configuration_key: request.configurationKey ?? null,
          error: request.error ?? null,
          created_at: request.createdAt.toISOString(),
          updated_at: request.updatedAt.toISOString(),
        })),
        "request_id"
      ),
      () => upsert(
        "fal_webhook_receipts",
        [...this.falWebhookReceipts.values()].map((receipt) => ({
          fingerprint: receipt.fingerprint,
          request_id: receipt.requestId,
          family_id: this.falTrainingRequests.get(receipt.requestId)?.familyId,
          received_at: receipt.receivedAt.toISOString(),
          status: receipt.status ?? "completed",
          lease_expires_at: receipt.leaseExpiresAt?.toISOString() ?? null,
        })),
        "fingerprint"
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
          method: r.method ?? null,
          status: r.status ?? "verified",
          expires_at: r.expiresAt?.toISOString() ?? null,
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
      // Cost evidence is append-only. Never schedule deletions from the
      // unit-of-work diff: a provider attempt must remain auditable even when
      // its Storybook later fails or is retried.
      () => upsert(
        "provider_cost_ledger",
        [...this.providerCostLedgerEntries.values()].map((entry) => ({
          id: entry.id,
          family_id: entry.owningEntityIds.familyId,
          provider: entry.provider,
          endpoint: entry.endpoint,
          model: entry.model,
          pricing_version: entry.pricingVersion,
          units: entry.units,
          estimated_cost_usd: entry.estimatedCostUsd,
          actual_cost_usd: entry.actualCostUsd,
          latency_ms: entry.latencyMs,
          request_id: entry.requestId,
          provider_request_id: entry.providerRequestId,
          owning_entity_ids: entry.owningEntityIds,
          attempt_type: entry.attemptType,
          outcome: entry.outcome,
          cost_category: entry.costCategory,
          created_at: entry.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "provider_kill_switches",
        [...this.providerKillSwitches.values()].map((killSwitch) => ({
          id: killSwitch.id,
          family_id: killSwitch.familyId ?? null,
          scope: killSwitch.scope,
          provider: killSwitch.provider ?? null,
          model: killSwitch.model ?? null,
          endpoint: killSwitch.endpoint ?? null,
          threshold: killSwitch.threshold,
          reason: killSwitch.reason,
          active: killSwitch.active,
          created_at: killSwitch.createdAt.toISOString(),
        }))
      ),
      () => upsert(
        "storybooks",
        [...this.storybooks.values()].map((b) => ({
          id: b.id,
          family_id: b.familyId,
          baby_id: b.babyId ?? null,
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
        "story_context_provenance",
        [...this.storyContextProvenance.values()].map((provenance) => ({
          id: provenance.id,
          family_id: provenance.familyId,
          storybook_id: provenance.storybookId,
          baby_id: provenance.babyId ?? null,
          persona_ids: provenance.personaIds,
          moment_ids: provenance.momentIds,
          first_count: provenance.firstCount ?? 0,
          past_story_summary_included: provenance.pastStorySummaryIncluded ?? false,
          photo_description_count: provenance.photoDescriptionCount ?? 0,
          token_estimate: provenance.tokenEstimate,
        }))
      ),
      () => upsert(
        "story_allowance_reservations",
        [...this.storyAllowanceReservations.values()].map((reservation) => ({
          storybook_id: reservation.storybookId,
          family_id: reservation.familyId,
          status: reservation.status,
          created_at: reservation.createdAt.toISOString(),
          released_at: reservation.releasedAt?.toISOString() ?? null,
          release_reason: reservation.releaseReason ?? null,
        })),
        "storybook_id"
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
          family_id: e.familyId ?? null,
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
          token: i.token,
          role: i.role,
          status: i.status,
          created_at: i.createdAt.toISOString(),
          expires_at: i.expiresAt.toISOString(),
          accepted_at: i.acceptedAt?.toISOString() ?? null,
          accepted_by_auth_user_id: i.acceptedByAuthUserId,
        }))
      ),
      () => upsert(
        "pending_briefs",
        [...this.pendingBriefs.entries()].map(([key, p]) => ({
          key,
          member_id: p.memberId,
          persona_id: p.personaId,
          brief: p.brief,
          selected_persona_ids: p.selectedPersonaIds ?? [],
          status: p.status ?? "pending",
          claim_token: p.claimToken ?? null,
          claim_expires_at: p.claimExpiresAt?.toISOString() ?? null,
          claimed_at: p.claimedAt?.toISOString() ?? null,
          storybook_id: p.storybookId ?? null,
          accepted_at: p.acceptedAt?.toISOString() ?? null,
          failed_at: p.failedAt?.toISOString() ?? null,
          error: p.error ?? null,
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
      () => deleteMissing(
        "story_allowance_reservations",
        new Set(this.storyAllowanceReservations.keys()),
        "storybook_id"
      ),
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
      () => deleteMissing("fal_webhook_receipts", new Set(this.falWebhookReceipts.keys()), "fingerprint"),
      () => deleteMissing("story_context_provenance", new Set(this.storyContextProvenance.keys())),
      // Provider cost rows are append-only during normal execution. A missing
      // snapshot row can therefore only be the explicit Hard-delete path.
      () => deleteMissing("provider_cost_ledger", new Set(this.providerCostLedgerEntries.keys())),
      () => deleteMissing("provider_kill_switches", new Set(this.providerKillSwitches.keys())),
      () => deleteMissing("fal_training_requests", new Set(this.falTrainingRequests.keys()), "request_id"),
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
