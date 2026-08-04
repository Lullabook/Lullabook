import type { BlobStore } from "@/adapters/types";
import { DataStore } from "@/db/store";
import { HardDeleteService, type HardDeleteReport } from "@/services/hard-delete";
import type { ProviderCostLedgerEntry } from "@/services/provider-cost-metering";

export const REACHABLE_FLOW_IDS = [
  "sign-in",
  "entitlement",
  "consent",
  "character",
  "persona",
  "storybook-enqueue",
  "bedtime-text",
  "learning-text",
  "two-persona",
  "twelve-pages",
  "reader",
  "finalize-pdf",
  "daily-notes",
  "failure-recovery",
  "provider-cost",
  "rls",
  "hard-delete",
  "cut-surfaces",
] as const;

export type EvidenceStatus = "PASS" | "FAIL" | "BLOCKED";
export type EvidenceClass = "deterministic" | "live-only" | "human";

export interface EvidenceItem {
  id: string;
  label: string;
  status: EvidenceStatus;
  evidenceClass: EvidenceClass;
  reproSteps: string[];
  command: string;
  commandOutput: string;
  missingStep?: string;
}

export const LIVE_EVIDENCE_MISSING_STEPS = {
  nativeSmoke:
    "Run the native Simulator/TestFlight smoke with release config and no development subscription, fal fallback, liveness, demo, or seed bypasses.",
  providerRequestIds:
    "Run the separately approved real-provider smoke and capture real Anthropic and fal request IDs from server-owned adapters.",
  billingReconciliation:
    "Reconcile the provider invoice/billing export against the server cost ledger for the smoke request IDs.",
  realOwnedLoraArtifacts:
    "Complete the two-Persona flow with real Family-owned LoRA artifacts and record both owned artifact keys before claiming likeness proof.",
  rls:
    "Run the authenticated Supabase/PostgreSQL RLS evidence against two real Families and retain the denied cross-Family read/write result.",
  hardDelete:
    "Run real database, blob-store, cache/CDN/backup, and provider-artifact Hard-delete evidence and retain the post-delete inventory for the deleted Family.",
  safeLiveFixtures:
    "Before any live run, rotate previously exposed credentials, provision fresh server-only credentials, and attach a synthetic or consenting-adult fixture manifest; never use minor photos.",
} as const;

const LIVE_ONLY_IDS = new Set([
  "native-smoke",
  "real-provider-request-ids",
  "billing-reconciliation",
  "real-owned-lora",
  "postgres-rls",
  "real-hard-delete",
  "safe-live-fixtures",
]);

export const HUMAN_RELEASE_CHECKLIST = [
  {
    id: "app-store-connect",
    name: "App Store Connect release account and build evidence",
    owner: "Guardian / release owner",
    action: "Attach the signed release build, App Store Connect status, and native smoke result.",
    checked: false,
  },
  {
    id: "revenuecat",
    name: "RevenueCat product, entitlement, and sandbox purchase evidence",
    owner: "Billing owner",
    action: "Attach the RevenueCat product/entitlement configuration and a successful sandbox purchase/restore receipt.",
    checked: false,
  },
  {
    id: "eas",
    name: "EAS production profile and artifact evidence",
    owner: "Mobile release owner",
    action: "Attach the EAS production build ID, profile, bundle scan output, and installable artifact.",
    checked: false,
  },
  {
    id: "legal",
    name: "Legal review of child-safety and deletion claims",
    owner: "Legal owner",
    action: "Record legal approval for consent, jurisdiction, retention, export, and Hard-delete language.",
    checked: false,
  },
  {
    id: "privacy",
    name: "Privacy notice and deletion/retention disclosure",
    owner: "Privacy owner",
    action: "Attach the published privacy notice and confirm cache, CDN, backup, provider, and retention disclosures.",
    checked: false,
  },
] as const;

export interface HumanChecklistItem {
  id: string;
  name: string;
  owner: string;
  action: string;
  checked: boolean;
}

export interface HumanChecklistResult {
  status: EvidenceStatus;
  items: HumanChecklistItem[];
  unchecked: HumanChecklistItem[];
  followUps: Array<{ id: string; name: string; owner: string; action: string }>;
}

export function buildHumanChecklist(items: HumanChecklistItem[] = HUMAN_RELEASE_CHECKLIST.map((item) => ({ ...item }))): HumanChecklistResult {
  const normalized = items.map((item) => {
    if (!item.id.trim() || !item.name.trim() || !item.owner.trim() || !item.action.trim()) {
      throw new Error("human checklist items require id, name, owner, and action");
    }
    return { ...item };
  });
  const unchecked = normalized.filter((item) => !item.checked);
  return {
    status: unchecked.length === 0 ? "PASS" : "BLOCKED",
    items: normalized,
    unchecked,
    followUps: unchecked.map(({ id, name, owner, action }) => ({ id, name, owner, action })),
  };
}

export function buildLiveOnlyBlockedEvidence(): EvidenceItem[] {
  const entries = [
    ["native-smoke", "Native Simulator/TestFlight smoke", LIVE_EVIDENCE_MISSING_STEPS.nativeSmoke],
    ["real-provider-request-ids", "Real provider request IDs", LIVE_EVIDENCE_MISSING_STEPS.providerRequestIds],
    ["billing-reconciliation", "Provider billing reconciliation", LIVE_EVIDENCE_MISSING_STEPS.billingReconciliation],
    ["real-owned-lora", "Real Family-owned LoRA artifacts", LIVE_EVIDENCE_MISSING_STEPS.realOwnedLoraArtifacts],
    ["postgres-rls", "Authenticated PostgreSQL RLS evidence", LIVE_EVIDENCE_MISSING_STEPS.rls],
    ["real-hard-delete", "Real database/blob/provider Hard-delete evidence", LIVE_EVIDENCE_MISSING_STEPS.hardDelete],
    ["safe-live-fixtures", "Safe credentials and synthetic/consenting-adult fixtures", LIVE_EVIDENCE_MISSING_STEPS.safeLiveFixtures],
  ] as const;
  return entries.map(([id, label, missingStep]) => ({
    id,
    label,
    status: "BLOCKED" as const,
    evidenceClass: "live-only" as const,
    reproSteps: [missingStep],
    command: "HUMAN/LIVE EVIDENCE — not run by deterministic verification",
    commandOutput: `BLOCKED — ${missingStep}`,
    missingStep,
  }));
}

export interface EvidencePacket {
  items: EvidenceItem[];
  flowChecklist: { total: number; pass: number; fail: number; blocked: number };
  humanChecklist: HumanChecklistResult;
  decision: { status: EvidenceStatus; rationale: string };
  releaseClaimAllowed: boolean;
}

export function validateEvidencePacket(packet: EvidencePacket) {
  const errors: string[] = [];
  const flowItems = packet.items.filter((item) => (REACHABLE_FLOW_IDS as readonly string[]).includes(item.id));
  const ids = flowItems.map((item) => item.id);
  const expected = new Set(REACHABLE_FLOW_IDS);
  const seen = new Set(ids);
  const missing = REACHABLE_FLOW_IDS.filter((id) => !seen.has(id));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const unknown = flowItems.filter((item) => !expected.has(item.id as (typeof REACHABLE_FLOW_IDS)[number]));
  const knownIds = new Set<string>([...REACHABLE_FLOW_IDS, ...LIVE_ONLY_IDS]);
  const unknownItems = packet.items.filter((item) => !knownIds.has(item.id));
  const liveItems = packet.items.filter((item) => LIVE_ONLY_IDS.has(item.id));
  const liveIds = liveItems.map((item) => item.id);
  const duplicateLiveIds = liveIds.filter((id, index) => liveIds.indexOf(id) !== index);
  const missingLive = [...LIVE_ONLY_IDS].filter((id) => !packet.items.some((item) => item.id === id));
  if (missing.length > 0) errors.push(`reachable flow evidence is missing: ${missing.join(", ")}`);
  if (missingLive.length > 0) errors.push(`live-only evidence is missing: ${missingLive.join(", ")}`);
  if (duplicateLiveIds.length > 0) errors.push(`live-only evidence is duplicated: ${duplicateLiveIds.join(", ")}`);
  if (unknownItems.length > 0) errors.push(`evidence has unknown criteria: ${unknownItems.map((item) => item.id).join(", ")}`);
  if (duplicates.length > 0) errors.push(`reachable flow evidence is duplicated: ${duplicates.join(", ")}`);
  if (unknown.length > 0) errors.push(`reachable flow evidence has unknown flows: ${unknown.map((item) => item.id).join(", ")}`);
  if (flowItems.length !== REACHABLE_FLOW_IDS.length) {
    errors.push("every reachable flow must have exactly one evidence item");
  }
  const actualFlowChecklist = {
    total: flowItems.length,
    pass: flowItems.filter((item) => item.status === "PASS").length,
    fail: flowItems.filter((item) => item.status === "FAIL").length,
    blocked: flowItems.filter((item) => item.status === "BLOCKED").length,
  };
  if (JSON.stringify(packet.flowChecklist) !== JSON.stringify(actualFlowChecklist)) {
    errors.push("flow checklist counts do not match the evidence items");
  }

  for (const item of packet.items) {
    if (!["PASS", "FAIL", "BLOCKED"].includes(item.status)) {
      errors.push(`${item.id}: invalid evidence status`);
    }
    if (!["deterministic", "live-only", "human"].includes(item.evidenceClass)) {
      errors.push(`${item.id}: invalid evidence class`);
    }
    if (!item.id.trim() || !item.label.trim() || item.reproSteps.length === 0 || item.reproSteps.some((step) => !step.trim())) {
      errors.push(`${item.id || "<unknown>"}: repro steps are required`);
    }
    if (!item.command.trim() || !item.commandOutput.trim()) {
      errors.push(`${item.id || "<unknown>"}: command and command output are required`);
    }
    if (/(?:https?:\/\/|api[_-]?key|secret|password|prompt|raw[_ -]?photo|photo[_ -]?bytes)/i.test(`${item.command} ${item.commandOutput}`)) {
      errors.push(`${item.id || "<unknown>"}: evidence output contains sensitive or provider URL material`);
    }
    if (item.status === "BLOCKED" && !item.missingStep?.trim()) {
      errors.push(`${item.id}: BLOCKED evidence requires the exact missing step`);
    }
    if (item.status === "PASS" && item.missingStep) {
      errors.push(`${item.id}: PASS evidence cannot retain a missing step`);
    }
    if (LIVE_ONLY_IDS.has(item.id) && item.status === "PASS" && item.evidenceClass !== "human") {
      errors.push(`${item.id}: live-only evidence cannot be PASS in deterministic verification`);
    }
  }

  const unchecked = packet.humanChecklist.items.filter((item) => !item.checked);
  const expectedChecklistStatus = unchecked.length === 0 ? "PASS" : "BLOCKED";
  if (packet.humanChecklist.status !== expectedChecklistStatus) {
    errors.push("human checklist status does not match its unchecked items");
  }
  if (packet.humanChecklist.followUps.length !== unchecked.length) {
    errors.push("every unchecked human checklist item must have one named follow-up");
  }
  const reportedUncheckedIds = new Set(packet.humanChecklist.unchecked.map((item) => item.id));
  const derivedUncheckedIds = new Set(unchecked.map((item) => item.id));
  if (reportedUncheckedIds.size !== derivedUncheckedIds.size || [...derivedUncheckedIds].some((id) => !reportedUncheckedIds.has(id))) {
    errors.push("unchecked human checklist items do not match the checklist rows");
  }
  const uncheckedIds = new Set(unchecked.map((item) => item.id));
  const followUpIds = new Set(packet.humanChecklist.followUps.map((followUp) => followUp.id));
  if (followUpIds.size !== uncheckedIds.size || [...uncheckedIds].some((id) => !followUpIds.has(id))) {
    errors.push("follow-up ids must match the unchecked human checklist items");
  }
  for (const followUp of packet.humanChecklist.followUps) {
    if (!followUp.name.trim() || !followUp.owner.trim() || !followUp.action.trim()) {
      errors.push(`${followUp.id}: unchecked human item has an incomplete follow-up`);
    }
  }
  const expectedDecisionStatus = packet.items.some((item) => item.status === "FAIL")
    ? "FAIL"
    : packet.items.some((item) => item.status === "BLOCKED") || packet.humanChecklist.status === "BLOCKED"
      ? "BLOCKED"
      : "PASS";
  if (packet.decision.status !== expectedDecisionStatus) {
    errors.push("decision status does not match the evidence items");
  }
  if (packet.releaseClaimAllowed !== (expectedDecisionStatus === "PASS")) {
    errors.push("release claim cannot be allowed unless the packet decision is PASS");
  }
  return { valid: errors.length === 0, errors };
}

export function createEvidencePacket(input: {
  flows: EvidenceItem[];
  liveEvidence: EvidenceItem[];
  humanChecklist: HumanChecklistResult;
}) {
  const flowIds = new Set(input.flows.map((item) => item.id));
  const missing = REACHABLE_FLOW_IDS.filter((id) => !flowIds.has(id));
  if (missing.length > 0) throw new Error(`reachable flow evidence is missing: ${missing.join(", ")}`);
  if (input.flows.length !== REACHABLE_FLOW_IDS.length) {
    throw new Error("every reachable flow must have exactly one evidence item");
  }
  const suppliedLiveIds = new Set(input.liveEvidence.map((item) => item.id));
  const missingLiveEvidence = buildLiveOnlyBlockedEvidence().filter((item) => !suppliedLiveIds.has(item.id));
  for (const item of input.liveEvidence) {
    if (LIVE_ONLY_IDS.has(item.id) && item.status === "PASS" && item.evidenceClass !== "human") {
      throw new Error(`${item.id}: live-only evidence cannot be PASS in deterministic verification`);
    }
  }

  const items = [...input.flows, ...input.liveEvidence, ...missingLiveEvidence];
  const flowChecklist = {
    total: input.flows.length,
    pass: input.flows.filter((item) => item.status === "PASS").length,
    fail: input.flows.filter((item) => item.status === "FAIL").length,
    blocked: input.flows.filter((item) => item.status === "BLOCKED").length,
  };
  const hasFailure = items.some((item) => item.status === "FAIL");
  const hasBlock = items.some((item) => item.status === "BLOCKED") || input.humanChecklist.status === "BLOCKED";
  const status: EvidenceStatus = hasFailure ? "FAIL" : hasBlock || missingLiveEvidence.length > 0 ? "BLOCKED" : "PASS";
  const packet: EvidencePacket = {
    items,
    flowChecklist,
    humanChecklist: input.humanChecklist,
    decision: {
      status,
      rationale: status === "PASS"
        ? "All deterministic, live, and human evidence passed."
        : status === "FAIL"
          ? "At least one evidence criterion failed."
          : "BLOCKED: live/native or human-owned evidence is missing; deterministic tests alone cannot make a release claim.",
    },
    releaseClaimAllowed: status === "PASS",
  };
  const validation = validateEvidencePacket(packet);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  return packet;
}

export interface RlsPolicyContract {
  status: EvidenceStatus;
  errors: string[];
}

function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`unsafe SQL identifier: ${value}`);
  return value;
}

export function validateRlsPolicyContract(input: {
  sql: string;
  familyTables: string[];
  serviceOnlyTables: string[];
}) {
  const sql = input.sql.toLowerCase();
  const errors: string[] = [];
  for (const rawTable of input.familyTables) {
    const table = identifier(rawTable).toLowerCase();
    const rls = new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
    const policy = new RegExp(`create\\s+policy[\\s\\S]{0,1200}\\bon\\s+${table}\\s+for\\s+`, "i");
    if (!rls.test(sql)) errors.push(`${table}: RLS is not enabled`);
    if (!policy.test(sql)) errors.push(`${table}: Family policy is missing`);
  }
  for (const rawTable of input.serviceOnlyTables) {
    const table = identifier(rawTable).toLowerCase();
    const rls = new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
    const policy = new RegExp(`create\\s+policy[\\s\\S]{0,1200}\\bon\\s+${table}\\s+for\\s+`, "i");
    if (!rls.test(sql)) errors.push(`${table}: RLS is not enabled`);
    if (policy.test(sql)) errors.push(`${table}: service-only table unexpectedly has a client policy`);
    if (table === "moderation_audit" && !/family_id\s+uuid\s+references\s+families/i.test(sql)) {
      errors.push("moderation_audit: family_id ownership is missing");
    }
    if (table === "moderation_audit" && !/moderation_audit_family_owned/i.test(sql)) {
      errors.push("moderation_audit: ownership constraint is missing");
    }
  }
  return { status: errors.length === 0 ? "PASS" : "FAIL", errors } satisfies RlsPolicyContract;
}

export interface RlsQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
}

type RlsQuery = (sql: string, values?: unknown[]) => Promise<RlsQueryResult>;

export async function runCrossFamilyRlsDenialProof(input: {
  query: RlsQuery;
  targets: Array<{ table: string; id: string; familyId: string }>;
  policyContract: RlsPolicyContract;
  familyA: string;
  foreignFamily: string;
}) {
  const operations: Array<{
    table: string;
    id: string;
    operation: "select" | "update" | "delete";
    denied: boolean;
    commandOutput: string;
  }> = [];
  const errors = [...input.policyContract.errors];
  for (const target of input.targets) {
    const table = identifier(target.table);
    if (target.familyId !== input.foreignFamily) {
      errors.push(`${table}/${target.id}: target is not owned by the claimed foreign Family`);
    }
    for (const operation of ["select", "update", "delete"] as const) {
      const sql = operation === "select"
        ? `select id from ${table} where id = $1`
        : `${operation} from ${table} where id = $1`;
      const command = operation === "select"
        ? sql
        : `${operation} ${table} set id = id where id = $1`;
      try {
        const result = operation === "select"
          ? await input.query(sql, [target.id])
          : await input.query(
              operation === "update"
                ? `update ${table} set id = id where id = $1`
                : `delete from ${table} where id = $1`,
              [target.id],
            );
        const denied = operation === "select" ? result.rows.length === 0 : result.rowCount === 0;
        operations.push({
          table,
          id: target.id,
          operation,
          denied,
          commandOutput: `${command} => ${denied ? "DENIED" : "ALLOWED"}`,
        });
        if (!denied) errors.push(`${table}/${operation}: foreign row was accessible`);
      } catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0] : "database error";
        errors.push(`${table}/${operation}: query errored before denial proof (${message})`);
        operations.push({ table, id: target.id, operation, denied: false, commandOutput: `${command} => ERROR (${message})` });
      }
    }
  }
  return {
    status: errors.length === 0 && operations.length > 0 && operations.every((operation) => operation.denied) ? "PASS" : "FAIL",
    familyA: input.familyA,
    foreignFamily: input.foreignFamily,
    policyContract: input.policyContract,
    operations,
    errors,
  };
}

export interface RetentionLimitation {
  artifactId: string;
  category: "provider" | "cache" | "cdn" | "backup" | "retention-queue";
  reason: string;
  owner: string;
  expiryWindow: string;
  retryBehavior: string;
  userVisibleStatus: string;
}

function retentionLimitationErrors(input: RetentionLimitation): string[] {
  return Object.entries(input)
    .filter(([, value]) => typeof value === "string" && !value.trim())
    .map(([field]) => `${field} is required for a retention limitation`);
}

export function buildRetentionLimitation(input: RetentionLimitation) {
  const errors = retentionLimitationErrors(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return { ...input };
}

export function reconcileModerationEvidence(input: {
  familyId: string;
  entries: Array<{ id: string; familyId?: string; resourceId: string }>;
  remainingAfterDelete: Array<{ id: string; familyId?: string; resourceId: string }>;
  crossFamilyDenied: boolean;
  policyContract: RlsPolicyContract;
  retentionException?: RetentionLimitation;
}) {
  const errors: string[] = [];
  const familyOwnedBefore = input.entries.filter((entry) => entry.familyId === input.familyId);
  const unowned = input.entries.filter((entry) => !entry.familyId);
  const familyOwnedAfter = input.remainingAfterDelete.filter((entry) => entry.familyId === input.familyId);
  const unownedAfter = input.remainingAfterDelete.filter((entry) => !entry.familyId);
  if (unowned.length > 0 || unownedAfter.length > 0) errors.push("moderation evidence must retain family_id ownership");
  if (!input.crossFamilyDenied) errors.push("cross-Family moderation evidence access was not denied");
  if (input.policyContract.status !== "PASS") errors.push(...input.policyContract.errors);
  if (familyOwnedAfter.length > 0 && !input.retentionException) {
    errors.push("Family-owned moderation evidence remained without an explicit retention exception");
  }
  const blockedByException = familyOwnedAfter.length > 0 && !!input.retentionException;
  return {
    status: errors.length > 0 ? "FAIL" : blockedByException ? "BLOCKED" : "PASS",
    familyOwnedBeforeDelete: familyOwnedBefore.length,
    familyOwnedAfterDelete: familyOwnedAfter.length,
    errors,
    retentionException: input.retentionException,
  };
}

export interface ExternalDeletionArtifact {
  id: string;
  familyId: string;
}

export interface ExternalDeletionResult {
  status: "deleted" | "retained" | "failed";
  commandOutput: string;
  limitation?: RetentionLimitation;
}

export interface ExternalDeletionStore {
  kind: RetentionLimitation["category"];
  inventory(familyId: string): Promise<ExternalDeletionArtifact[]>;
  delete(artifact: ExternalDeletionArtifact): Promise<ExternalDeletionResult>;
}

const BLOB_PREFIXES = ["photos", "persona-creation", "lora", "training-inputs", "books", "styles", "avatars", "likeness-samples", "voice"] as const;

function familyReferencedBlobKeys(store: DataStore, familyId: string) {
  const keys = new Set<string>();
  for (const persona of store.personas.values()) {
    if (persona.familyId !== familyId) continue;
    for (const key of [persona.loraWeightKey, persona.avatarKey, ...(persona.reviewSampleKeys ?? [])]) {
      if (key) keys.add(key);
    }
  }
  for (const request of store.falTrainingRequests.values()) {
    if (request.familyId !== familyId) continue;
    for (const key of [request.inputZipKey, request.loraWeightKey, request.configurationKey]) {
      if (key) keys.add(key);
    }
  }
  for (const style of store.customStyles.values()) {
    if (style.familyId === familyId && style.loraWeightKey) keys.add(style.loraWeightKey);
  }
  const bookIds = new Set([...store.storybooks.values()]
    .filter((book) => book.familyId === familyId)
    .map((book) => book.id));
  for (const page of store.pages.values()) {
    if (!bookIds.has(page.storybookId)) continue;
    for (const key of [page.illustrationBlobKey, page.videoBlobKey]) {
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

async function listOwnedBlobKeys(
  blobs: BlobStore,
  familyId: string,
  personaIds: string[],
  bookIds: string[],
  referencedKeys: string[],
) {
  const prefixes = [
    ...BLOB_PREFIXES.map((prefix) => `${prefix}/${familyId}/`),
    ...personaIds.flatMap((id) => [`photos/${id}/`, `voice/${id}/`, `avatars/${familyId}/${id}/`, `likeness-samples/${familyId}/${id}/`]),
    ...bookIds.map((id) => `${id}/`),
  ];
  const keys = new Set<string>();
  for (const key of referencedKeys) {
    if (await blobs.get(key)) keys.add(key);
  }
  for (const prefix of prefixes) {
    for (const key of await blobs.list(prefix)) keys.add(key);
  }
  return [...keys];
}

function nonZeroCounts(counts: Record<string, number>) {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

function familyDatabaseCounts(store: DataStore, familyId: string) {
  const memberIds = new Set([...store.members.values()].filter((item) => item.familyId === familyId).map((item) => item.id));
  const personaIds = new Set([...store.personas.values()].filter((item) => item.familyId === familyId).map((item) => item.id));
  const babyIds = new Set([...store.babies.values()].filter((item) => item.familyId === familyId).map((item) => item.id));
  const bookIds = new Set([...store.storybooks.values()].filter((item) => item.familyId === familyId).map((item) => item.id));
  const pageIds = new Set([...store.pages.values()].filter((item) => bookIds.has(item.storybookId)).map((item) => item.id));
  const requestIds = new Set([...store.falTrainingRequests.values()].filter((item) => item.familyId === familyId).map((item) => item.requestId));
  const counts: Record<string, number> = {
    families: store.families.has(familyId) ? 1 : 0,
    members: memberIds.size,
    personas: personaIds.size,
    characters: [...store.characters.values()].filter((item) => item.familyId === familyId).length,
    subscriptions: store.subscriptions.has(familyId) ? 1 : 0,
    consentReceipts: [...store.consentReceipts.values()].filter((item) => item.familyId === familyId).length,
    lightConsentReceipts: [...store.lightConsentReceipts.values()].filter((item) => item.familyId === familyId).length,
    storybooks: bookIds.size,
    pages: pageIds.size,
    pageCandidates: [...store.pageCandidates.values()].filter((item) => pageIds.has(item.pageId)).length,
    shareLinks: [...store.shareLinks.values()].filter((item) => bookIds.has(item.storybookId)).length,
    moderationAudit: store.getModerationAuditIdsByFamily(familyId).length,
    pendingBriefs: [...store.pendingBriefs.values()].filter((item) => memberIds.has(item.memberId)).length,
    invites: [...store.invites.values()].filter((item) => item.familyId === familyId).length,
    purgeScheduled: store.purgeScheduled.has(familyId) ? 1 : 0,
    persistedGenerations: [...store.persistedGenerations.values()].filter((item) => bookIds.has(item.storybookId)).length,
    textStories: [...store.textStories.values()].filter((item) => item.familyId === familyId).length,
    storyAllowanceReservations: [...store.storyAllowanceReservations.values()].filter((item) => item.familyId === familyId).length,
    providerCostLedger: [...store.providerCostLedgerEntries.values()].filter((item) => item.owningEntityIds.familyId === familyId).length,
    providerKillSwitches: [...store.providerKillSwitches.values()].filter((item) => item.familyId === familyId).length,
    pushSubscriptions: [...store.pushSubscriptions.values()].filter((item) => memberIds.has(item.memberId)).length,
    emailPlusVpcRequests: [...store.emailPlusVpcRequests.values()].filter((item) => item.familyId === familyId).length,
    babies: babyIds.size,
    babyPersonBonds: [...store.babyPersonBonds.values()].filter((item) => babyIds.has(item.babyId)).length,
    voiceClips: [...store.voiceClips.values()].filter((item) => item.familyId === familyId).length,
    voiceConsentReceipts: [...store.voiceConsentReceipts.values()].filter((item) => item.familyId === familyId).length,
    moments: [...store.moments.values()].filter((item) => item.familyId === familyId).length,
    momentPeople: [...store.momentPeople.values()].filter((item) => {
      const moment = store.moments.get(item.momentId);
      return moment?.familyId === familyId;
    }).length,
    creditLedger: [...store.creditLedgerEntries.values()].filter((item) => item.familyId === familyId).length,
    creditPurchasedBalances: store.creditPurchasedBalances.has(familyId) ? 1 : 0,
    babyAutoContextWatermarks: [...store.autoContextWatermarks.keys()].filter((id) => babyIds.has(id)).length,
    babyPastStorySummaries: [...store.babyPastStorySummaries.values()].filter((item) => babyIds.has(item.babyId)).length,
    journalNudgeStates: [...store.journalNudgeStates.values()].filter((item) => memberIds.has(item.memberId)).length,
    customStyles: [...store.customStyles.values()].filter((item) => item.familyId === familyId).length,
    falTrainingRequests: requestIds.size,
    falWebhookReceipts: [...store.falWebhookReceipts.values()].filter((item) => requestIds.has(item.requestId)).length,
    storyContextProvenance: [...store.storyContextProvenance.values()].filter((item) => item.familyId === familyId).length,
  };
  return { counts, personaIds: [...personaIds], bookIds: [...bookIds] };
}

function blobCounts(keys: string[]) {
  const sourcePhotos = keys.filter((key) => /^(?:photos|persona-creation)\//.test(key));
  const trainingInputs = keys.filter((key) => key.startsWith("training-inputs/"));
  const loraArtifacts = keys.filter((key) => key.startsWith("lora/"));
  const derivatives = keys.filter((key) => /^(?:avatars|likeness-samples|books|styles|voice)\//.test(key));
  return {
    total: keys.length,
    sourcePhotos: sourcePhotos.length,
    trainingInputs: trainingInputs.length,
    loraArtifacts: loraArtifacts.length,
    derivatives: derivatives.length,
    keys,
  };
}

function providerArtifactKeys(store: DataStore, familyId: string) {
  const keys = new Set<string>();
  for (const request of store.falTrainingRequests.values()) {
    if (request.familyId !== familyId) continue;
    for (const key of [request.loraWeightKey, request.configurationKey]) {
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

export interface HardDeleteEvidence {
  status: EvidenceStatus;
  familyId: string;
  inventory: {
    database: Record<string, number>;
    blobs: ReturnType<typeof blobCounts>;
    providerArtifacts: string[];
    external: Record<string, number>;
  };
  attempts: Array<{
    artifactId: string;
    category: string;
    status: EvidenceStatus;
    commandOutput: string;
  }>;
  retentionLimitations: RetentionLimitation[];
  residuals: { database: Record<string, number>; blobs: string[]; external: Record<string, string[]> };
  restart: { idempotent: boolean; report: HardDeleteReport };
  errors: string[];
}

export async function runHardDeleteEvidence(input: {
  familyId: string;
  guardianMemberId: string;
  hardDelete: HardDeleteService;
  restartHardDelete: () => HardDeleteService;
  store: DataStore;
  blobs: BlobStore;
  externalStores: ExternalDeletionStore[];
  providerRetentionLimitations: RetentionLimitation[];
}) {
  const before = familyDatabaseCounts(input.store, input.familyId);
  const referencedBlobKeys = familyReferencedBlobKeys(input.store, input.familyId);
  const beforeBlobKeys = await listOwnedBlobKeys(input.blobs, input.familyId, before.personaIds, before.bookIds, referencedBlobKeys);
  const providerKeys = providerArtifactKeys(input.store, input.familyId);
  const externalBefore = new Map<string, ExternalDeletionArtifact[]>();
  for (const external of input.externalStores) {
    externalBefore.set(external.kind, await external.inventory(input.familyId));
  }
  const externalCounts = Object.fromEntries([...externalBefore.entries()].map(([kind, artifacts]) => [kind, artifacts.length]));
  const attempts: HardDeleteEvidence["attempts"] = [];
  const retentionLimitations = [...input.providerRetentionLimitations];
  const errors = retentionLimitations.flatMap((limitation) => retentionLimitationErrors(limitation));
  let report: HardDeleteReport;

  try {
    report = await input.hardDelete.hardDelete(input.guardianMemberId);
  } catch (error) {
    return {
      status: "FAIL" as const,
      familyId: input.familyId,
      inventory: {
        database: before.counts,
        blobs: blobCounts(beforeBlobKeys),
        providerArtifacts: providerKeys,
        external: externalCounts,
      },
      attempts,
      retentionLimitations,
      residuals: { database: before.counts, blobs: beforeBlobKeys, external: {} },
      restart: { idempotent: false, report: {
        familyId: input.familyId,
        inventory: {},
        deleted: { database: {}, blobKeys: [], providerArtifacts: [] },
        provider: { limitations: [] },
      } },
      errors: [error instanceof Error ? error.message : "Hard-delete failed"],
    } satisfies HardDeleteEvidence;
  }

  const after = familyDatabaseCounts(input.store, input.familyId);
  const remainingDatabase = nonZeroCounts(after.counts);
  const afterBlobKeys = await listOwnedBlobKeys(input.blobs, input.familyId, before.personaIds, before.bookIds, referencedBlobKeys);
  for (const [table, count] of Object.entries(before.counts)) {
    for (let index = 0; index < count; index += 1) {
      const deletedCount = report.deleted.database[table];
      const residual = after.counts[table] ?? 0;
      const status: EvidenceStatus = residual === 0 &&
        (deletedCount === undefined || deletedCount === count)
        ? "PASS"
        : "FAIL";
      attempts.push({ artifactId: `${table}:${index + 1}`, category: "database", status, commandOutput: `database ${table} row ${index + 1}: contract=${deletedCount ?? "not reported"}/${count}, residual=${residual} -> ${status}` });
      if (status === "FAIL") errors.push(`${table}: database rows remained after Hard-delete`);
    }
  }
  for (const key of beforeBlobKeys) {
    const status: EvidenceStatus = !afterBlobKeys.includes(key) && report.deleted.blobKeys.includes(key) ? "PASS" : "FAIL";
    attempts.push({ artifactId: key, category: "blob", status, commandOutput: `blob ${key}: contract=${report.deleted.blobKeys.includes(key)}, residual=${afterBlobKeys.includes(key)} -> ${status}` });
    if (status === "FAIL") errors.push(`${key}: blob or derivative remained after Hard-delete`);
  }

  for (const key of providerKeys) {
    const limitation = report.provider.limitations.find((item) => item.artifactKey === key);
    const deleted = report.deleted.providerArtifacts.includes(key);
    if (deleted) {
      attempts.push({ artifactId: key, category: "provider", status: "PASS", commandOutput: `provider deletion attempted: ${key}` });
    } else if (limitation) {
      attempts.push({ artifactId: key, category: "provider", status: "BLOCKED", commandOutput: "provider deletion is contract-limited" });
      if (!retentionLimitations.some((item) => item.artifactId === key)) {
        errors.push(`${key}: provider limitation lacks a complete retention record`);
      }
    } else {
      attempts.push({ artifactId: key, category: "provider", status: "FAIL", commandOutput: "provider deletion was not attempted" });
      errors.push(`${key}: provider artifact deletion was not attempted`);
    }
  }

  for (const external of input.externalStores) {
    for (const artifact of externalBefore.get(external.kind) ?? []) {
      const result = await external.delete(artifact);
      if (result.status === "deleted") {
        attempts.push({ artifactId: artifact.id, category: external.kind, status: "PASS", commandOutput: result.commandOutput });
      } else if (result.limitation) {
        retentionLimitations.push(result.limitation);
        errors.push(...retentionLimitationErrors(result.limitation));
        attempts.push({ artifactId: artifact.id, category: external.kind, status: "BLOCKED", commandOutput: result.commandOutput });
      } else {
        attempts.push({ artifactId: artifact.id, category: external.kind, status: "FAIL", commandOutput: result.commandOutput });
        errors.push(`${artifact.id}: deletion did not return a retention limitation`);
      }
    }
  }

  const residualExternal: Record<string, string[]> = {};
  for (const external of input.externalStores) {
    const remaining = await external.inventory(input.familyId);
    if (remaining.length > 0) residualExternal[external.kind] = remaining.map((artifact) => artifact.id);
  }
  const restart = await input.restartHardDelete().hardDelete(input.guardianMemberId);
  const idempotent = Object.keys(restart.inventory).length === 0 &&
    restart.deleted.blobKeys.length === 0 &&
    restart.deleted.providerArtifacts.length === 0 &&
    restart.provider.limitations.length === 0;
  if (!idempotent) errors.push("repeat Hard-delete after process restart was not idempotent");
  if (Object.keys(remainingDatabase).length > 0) errors.push("database rows remained after Hard-delete");
  if (afterBlobKeys.length > 0) errors.push("blob or derivative keys remained after Hard-delete");
  if (Object.keys(residualExternal).length > 0 && retentionLimitations.length === 0) {
    errors.push("external retention remained without a documented limitation");
  }

  const status: EvidenceStatus = errors.length > 0
    ? "FAIL"
    : retentionLimitations.length > 0 || Object.keys(residualExternal).length > 0
      ? "BLOCKED"
      : "PASS";
  return {
    status,
    familyId: input.familyId,
    inventory: {
      database: before.counts,
      blobs: blobCounts(beforeBlobKeys),
      providerArtifacts: providerKeys,
      external: externalCounts,
    },
    attempts,
    retentionLimitations,
    residuals: { database: remainingDatabase, blobs: afterBlobKeys, external: residualExternal },
    restart: { idempotent, report: restart },
    errors,
  } satisfies HardDeleteEvidence;
}

function isEvidenceId(value: string): boolean {
  return value.trim().length >= 8 &&
    !/^(?:deterministic|fake|test|placeholder|example)(?:[-_:]|$)/i.test(value) &&
    !/^https?:\/\//i.test(value);
}

export interface ProviderCharge {
  id: string;
  billingExportId: string;
  provider: string;
  providerRequestId: string;
  amountUsd: number;
}

export function reconcileProviderCharges(input: {
  familyId: string;
  ledgerEntries: ProviderCostLedgerEntry[];
  charges: ProviderCharge[];
  approvedBudgetUsd?: number;
}) {
  const errors: string[] = [];
  const missingEvidence: string[] = [];
  if (!Number.isFinite(input.approvedBudgetUsd) || (input.approvedBudgetUsd ?? 0) <= 0) {
    missingEvidence.push("an approved positive provider-smoke budget");
  }
  if (input.charges.length === 0) missingEvidence.push("the provider invoice/billing export");
  const entries = input.ledgerEntries.filter((entry) => entry.owningEntityIds.familyId === input.familyId);
  const mappings: Array<{
    chargeId: string;
    requestId: string;
    providerRequestId: string;
    amountUsd: number;
  }> = [];
  const usedEntries = new Set<string>();
  for (const charge of input.charges) {
    if (!isEvidenceId(charge.billingExportId)) {
      missingEvidence.push(`${charge.id}: an authenticated billing-export provenance ID`);
    }
    if (!Number.isFinite(charge.amountUsd) || charge.amountUsd <= 0) {
      errors.push(`${charge.id}: charge amount must be positive`);
      continue;
    }
    const entry = entries.find((candidate) =>
      candidate.provider === charge.provider &&
      candidate.providerRequestId === charge.providerRequestId &&
      !usedEntries.has(candidate.id)
    );
    if (!entry) {
      errors.push(`${charge.id}: charge does not map to a Family-owned request ID`);
      continue;
    }
    usedEntries.add(entry.id);
    if (entry.actualCostUsd !== null && Math.abs(entry.actualCostUsd - charge.amountUsd) > 0.000001) {
      errors.push(`${charge.id}: invoice amount conflicts with the ledger actual cost`);
    }
    mappings.push({
      chargeId: charge.id,
      requestId: entry.requestId,
      providerRequestId: entry.providerRequestId,
      amountUsd: charge.amountUsd,
    });
  }
  if (entries.some((entry) => !usedEntries.has(entry.id))) {
    missingEvidence.push("a charge line for every Family-owned provider request ID");
  }
  const totalActualCostUsd = mappings.reduce((sum, mapping) => sum + mapping.amountUsd, 0);
  if (input.approvedBudgetUsd !== undefined && totalActualCostUsd > input.approvedBudgetUsd) {
    errors.push("actual provider charges exceed the approved budget");
  }
  const status = errors.length > 0 ? "FAIL" : missingEvidence.length > 0 ? "BLOCKED" : "PASS";
  return { status, mappings, totalActualCostUsd, approvedBudgetUsd: input.approvedBudgetUsd, missingEvidence, errors };
}
