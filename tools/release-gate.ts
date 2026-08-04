import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { FakeFal } from "@/adapters/fakes";
import { RlsViolationError } from "@/db/store";
import { deriveStorybookProgress } from "@/lib/storybook-progress";
import { HardDeleteService } from "@/services/hard-delete";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";
import { createTestContext, goodPhoto } from "@/test/fixtures";

/**
 * Deterministic release evidence is deliberately not release evidence. This
 * module runs the same service composition used by the local app, but with
 * in-memory persistence and fake adapters. The fakes prove wiring and state
 * transitions; the report keeps their provenance visible and stays blocked
 * until separately-owned native/provider evidence is supplied.
 */

export const RELEASE_GATE_FLOW = [
  { id: "sign-in", label: "Sign in and resolve the Guardian Family" },
  { id: "entitlement", label: "Read the server-authoritative entitlement" },
  { id: "consent", label: "Record jurisdiction-configured consent" },
  { id: "character", label: "Create a fictional Character" },
  { id: "persona", label: "Create and accept a Baby and Adult Persona" },
  { id: "storybook-enqueue", label: "Enqueue a Storybook through the workflow boundary" },
  { id: "bedtime-text", label: "Generate Bedtime Story text" },
  { id: "learning-text", label: "Generate Learning Story text" },
  { id: "two-persona", label: "Compose a two-Persona Scene" },
  { id: "twelve-pages", label: "Persist exactly twelve ordered Pages" },
  { id: "reader", label: "Read progress and Page text through the reader projection" },
  { id: "finalize-pdf", label: "Finalize and export a PDF keepsake" },
  { id: "daily-notes", label: "Capture and list a Daily Note in the Journal timeline" },
  { id: "failure-recovery", label: "Persist failure and recover without a second Story charge" },
  { id: "provider-cost", label: "Publish provider IDs, route, outcome, and cost evidence" },
  { id: "rls", label: "Deny a cross-Family read" },
  { id: "hard-delete", label: "Hard-delete one Family without touching another" },
  { id: "cut-surfaces", label: "Keep cut surfaces inert" },
] as const;

export const LIVE_EVIDENCE_MISSING_STEPS = {
  nativeSmoke:
    "Run the native Simulator/TestFlight smoke with release config and no development subscription, fal fallback, liveness, demo, or seed bypasses.",
  providerRequestIds:
    "Run the separately approved real-provider smoke and capture real Anthropic and fal request IDs from server-owned adapters.",
  billingReconciliation:
    "Reconcile the provider invoice/billing export against the server cost ledger for the smoke request IDs.",
  realOwnedLoraArtifacts:
    "Complete the two-Persona flow with real Family-owned LoRA artifacts and record both owned artifact keys before claiming two-Persona likeness proof.",
  rls:
    "Run the authenticated Supabase/PostgreSQL RLS evidence against two real Families and retain the denied cross-Family read/write result.",
  hardDelete:
    "Run real database, blob-store, and provider-artifact Hard-delete evidence and retain the post-delete inventory for the deleted Family.",
  safeLiveFixtures:
    "Rotate exposed credentials and attach a synthetic or consenting-adult fixture manifest before any live run.",
} as const;

export type LiveEvidenceMissingStep = keyof typeof LIVE_EVIDENCE_MISSING_STEPS;

export interface NativeEvidence {
  approval?: {
    approved: true;
    budgetUsd: number;
    fixture: "synthetic" | "consenting-adult";
    credentialsRotated: true;
    serverOnlyCredentials: true;
  };
  nativeSimulatorOrTestFlightSmoke?: {
    profile: "production";
    buildId: string;
    evidenceId: string;
  };
  providerEvidenceSource?: "real-provider";
  realProviderRequestIds?: Array<{ provider: "anthropic" | "fal"; id: string }>;
  billingReconciliation?: {
    verified: true;
    invoiceId: string;
    requestIds: string[];
  };
  actualProviderCostUsd?: number;
  realOwnedLoraArtifacts?: Array<{ key: string; familyId: string; personaId: string }>;
  rlsEvidence?: { verified: true; evidenceId: string; familyIds: [string, string] };
  hardDeleteEvidence?: { verified: true; evidenceId: string; familyId: string };
}

export interface LiveEvidenceDecision {
  status: "passed" | "blocked";
  missingEvidence: string[];
}

export interface ReleaseProfileScanInput {
  [file: string]: string;
}

export interface ReleaseProfileViolation {
  rule: string;
  file: string;
  match: string;
}

export interface ReleaseProfileScan {
  status: "passed" | "failed";
  files: string[];
  violations: ReleaseProfileViolation[];
}

interface StageEvidence {
  id: (typeof RELEASE_GATE_FLOW)[number]["id"];
  label: string;
  status: "passed" | "failed";
  summary: string;
  details?: Record<string, string | number | boolean>;
}

interface ProviderEvidence {
  source: "deterministic";
  requestIds: string[];
  attempts: number;
  failures: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  actualCostReconciled: false;
  entries: Array<{
    requestId: string;
    provider: string;
    endpoint: string;
    model: string;
    pricingVersion: string;
    outcome: string;
    estimatedCostUsd: number;
    actualCostUsd: number | null;
  }>;
}

interface DeterministicReport {
  status: "passed" | "failed";
  flowChecklist: { total: number; passed: number; failed: number; pending: number };
  stages: StageEvidence[];
  /** Expected failure/recovery receipts; these are not gate errors. */
  failures: string[];
  errors: string[];
  providerEvidence: ProviderEvidence;
  twoPersona: {
    status: "passed" | "blocked";
    realOwnedLoraArtifacts: boolean;
    blockedStep?: string;
  };
  cutSurfaces: Array<{ feature: string; status: "inert" | "reachable"; evidence: string }>;
}

export interface ReachableReleaseGateReport {
  deterministic: DeterministicReport;
  releaseProfile: ReleaseProfileScan;
  liveEvidence: LiveEvidenceDecision;
  decision: {
    status: "passed" | "failed" | "blocked";
    failures: string[];
    missingEvidence: string[];
    rationale: string;
  };
  releaseEvidenceEligible: boolean;
}

function cleanText(value: unknown): string {
  return String(value)
    .replace(/https?:\/\/[^\s"',;}\]]+/gi, "[REDACTED_URL]")
    .replace(/(?:api[_-]?key|secret|token|password|prompt|photo|image|media)\s*[:=]\s*[^\s,;}]+/gi, "[REDACTED]")
    .slice(0, 300);
}

function safeProviderEndpoint(endpoint: string): string {
  return /^https?:\/\//i.test(endpoint) ? "[REDACTED_PROVIDER_URL]" : endpoint;
}

function isSyntheticRequestId(value: string): boolean {
  return /^(?:deterministic|fake|test|placeholder|example)(?:[-_:]|$)/i.test(value);
}

function isHumanEvidenceId(value: string): boolean {
  return value.trim().length >= 8 &&
    !isSyntheticRequestId(value) &&
    !/^https?:\/\//i.test(value);
}

function isRealArtifactKey(value: string): boolean {
  return value.trim().length > 0 &&
    !/^(?:https?|data|blob):/i.test(value) &&
    !/(?:deterministic|fake|test|placeholder|example|memory:)/i.test(value);
}

export function evaluateLiveEvidence(evidence: NativeEvidence = {}): LiveEvidenceDecision {
  const missingEvidence: string[] = [];
  const approval = evidence.approval;
  if (
    approval?.approved !== true ||
    !Number.isFinite(approval?.budgetUsd) ||
    (approval?.budgetUsd ?? 0) <= 0 ||
    !["synthetic", "consenting-adult"].includes(approval?.fixture ?? "") ||
    approval?.credentialsRotated !== true ||
    approval?.serverOnlyCredentials !== true
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.safeLiveFixtures);
  }

  const native = evidence.nativeSimulatorOrTestFlightSmoke;
  if (
    !native ||
    native.profile !== "production" ||
    !isHumanEvidenceId(native.buildId) ||
    !isHumanEvidenceId(native.evidenceId)
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.nativeSmoke);
  }

  const requestEvidence = evidence.realProviderRequestIds ?? [];
  const requestIds = requestEvidence.map(({ id }) => id);
  const providers = new Set(requestEvidence.map(({ provider }) => provider));
  if (
    evidence.providerEvidenceSource !== "real-provider" ||
    requestEvidence.length < 2 ||
    providers.size !== 2 ||
    !providers.has("anthropic") ||
    !providers.has("fal") ||
    new Set(requestIds).size !== requestIds.length ||
    requestIds.some((requestId) => !isHumanEvidenceId(requestId))
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.providerRequestIds);
  }

  const billing = evidence.billingReconciliation;
  const billedRequestIds = billing?.requestIds ?? [];
  if (
    billing?.verified !== true ||
    !isHumanEvidenceId(billing.invoiceId) ||
    billedRequestIds.length !== requestIds.length ||
    new Set(billedRequestIds).size !== billedRequestIds.length ||
    billedRequestIds.some((id) => !requestIds.includes(id)) ||
    !Number.isFinite(evidence.actualProviderCostUsd) ||
    (evidence.actualProviderCostUsd ?? 0) <= 0 ||
    (approval && (evidence.actualProviderCostUsd ?? 0) > approval.budgetUsd)
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.billingReconciliation);
  }

  const artifacts = evidence.realOwnedLoraArtifacts ?? [];
  const artifactPersonas = new Set(artifacts.map((artifact) => artifact.personaId));
  if (
    artifacts.length < 2 ||
    artifactPersonas.size < 2 ||
    artifacts.some((artifact) => !isRealArtifactKey(artifact.key) || !isHumanEvidenceId(artifact.familyId) || !isHumanEvidenceId(artifact.personaId))
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.realOwnedLoraArtifacts);
  }

  const rls = evidence.rlsEvidence;
  if (
    !rls ||
    rls.verified !== true ||
    !isHumanEvidenceId(rls.evidenceId) ||
    rls.familyIds.length !== 2 ||
    new Set(rls.familyIds).size !== 2 ||
    rls.familyIds.some((id) => !isHumanEvidenceId(id))
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.rls);
  }

  const hardDelete = evidence.hardDeleteEvidence;
  if (
    !hardDelete ||
    hardDelete.verified !== true ||
    !isHumanEvidenceId(hardDelete.evidenceId) ||
    !isHumanEvidenceId(hardDelete.familyId)
  ) {
    missingEvidence.push(LIVE_EVIDENCE_MISSING_STEPS.hardDelete);
  }
  return {
    status: missingEvidence.length === 0 ? "passed" : "blocked",
    missingEvidence,
  };
}

const RELEASE_SCAN_RULES = [
  {
    rule: "provider-key",
    pattern: /(?:FAL_API_KEY|ANTHROPIC_API_KEY|SIGHTENGINE_API_(?:USER|SECRET)|STRIPE_SECRET_KEY|REVENUECAT_WEBHOOK_SECRET|INNGEST_(?:EVENT|SIGNING)_KEY|BLOB_S3_SECRET_ACCESS_KEY)/i,
  },
  {
    rule: "privileged-supabase-key",
    pattern: /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|service[_ -]?role|sb_secret_)/i,
  },
  {
    rule: "dev-password",
    pattern: /(?:EXPO_PUBLIC_DEV_(?:PASSWORD|EMAIL)|DEV_PASSWORD)/i,
  },
  { rule: "force-subscription", pattern: /DEV_FORCE_SUBSCRIPTION/i },
  { rule: "liveness-bypass", pattern: /DEV_LIVENESS_BYPASS/i },
  { rule: "fal-fallback", pattern: /DEV_FAL_FALLBACK/i },
  { rule: "demo-seed", pattern: /(?:DEV_DEMO_SEED|DEMO_SEED|DEV_SEED)/i },
  {
    rule: "equivalent-dev-bypass",
    pattern: /(?:EXPO_PUBLIC_(?:DEV|BYPASS)|(?:force|fallback|bypass|demo)[_-](?:subscription|liveness|fal|seed))/i,
  },
] as const;

export function scanReleaseProfileContents(input: ReleaseProfileScanInput): ReleaseProfileScan {
  const violations: ReleaseProfileViolation[] = [];
  for (const [file, contents] of Object.entries(input)) {
    for (const { rule, pattern } of RELEASE_SCAN_RULES) {
      const match = contents.match(pattern);
      if (match) violations.push({ rule, file, match: match[0] });
    }
  }
  return {
    status: violations.length === 0 ? "passed" : "failed",
    files: Object.keys(input),
    violations,
  };
}

export function scanReleaseProfile(root = process.cwd()): ReleaseProfileScan {
  const relativeFiles = ["mobile/eas.json", "mobile/app.json", "mobile/app.config.ts"];
  const input: ReleaseProfileScanInput = {};
  for (const file of relativeFiles) {
    const absolute = join(root, file);
    if (existsSync(absolute)) input[file] = readFileSync(absolute, "utf8");
  }
  const scan = scanReleaseProfileContents(input);
  if (relativeFiles.some((file) => !input[file])) {
    return {
      ...scan,
      status: "failed",
      violations: [
        ...scan.violations,
        ...relativeFiles
          .filter((file) => !input[file])
          .map((file) => ({ rule: "missing-release-profile", file, match: file })),
      ],
    };
  }
  return scan;
}

function cutSurfaceEvidence(root = process.cwd()): DeterministicReport["cutSurfaces"] {
  const read = (file: string) => {
    const path = join(root, file);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };
  const audioRoutes = [
    "src/app/api/voice/clip/route.ts",
    "src/app/api/voice/list/route.ts",
    "src/app/api/voice/playback/route.ts",
    "src/app/api/voice/revoke/route.ts",
  ];
  const inviteRoutes = ["src/app/api/family/invite/route.ts", "src/app/api/family/accept/route.ts"];
  const audioInert = audioRoutes.every((file) => /isR1AudioEnabled|r1CutResponse/.test(read(file)));
  const invitesInert = inviteRoutes.every((file) => /isR1MultiFamilyEnabled|r1CutResponse/.test(read(file)));
  const videoAbsent = !existsSync(join(root, "src/app/api/video/route.ts"));
  const shareAbsent = !existsSync(join(root, "src/app/api/share/route.ts"));
  const journalHeavyInert = /isR1JournalMachineryEnabled/.test(read("src/services/journal-nudge.ts"));
  return [
    { feature: "audio", status: audioInert ? "inert" : "reachable", evidence: "tests/149-dead-surface-sweep.test.ts + gated voice routes" },
    { feature: "video", status: videoAbsent ? "inert" : "reachable", evidence: "tests/149-dead-surface-sweep.test.ts + no video route" },
    { feature: "invitations", status: invitesInert ? "inert" : "reachable", evidence: "tests/149-dead-surface-sweep.test.ts + gated family routes" },
    { feature: "share links", status: shareAbsent ? "inert" : "reachable", evidence: "tests/149-dead-surface-sweep.test.ts + no share route" },
    { feature: "heavy Journal machinery", status: journalHeavyInert ? "inert" : "reachable", evidence: "src/services/journal-nudge.ts flag gate" },
  ];
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Deterministic fakes are not a margin decision. They prove service wiring and
 * retain cost receipts, while the separately-owned live gate owns the real
 * economic approval. Keep the fake composition from being closed by the
 * accumulated deterministic ledger before it reaches every required stage.
 */
class DeterministicCostMeter extends ProviderCostMeteringService {
  override authorizeSpend(input: Parameters<ProviderCostMeteringService["authorizeSpend"]>[0]) {
    return super.authorizeSpend({ ...input, p95FullCapMarginPercent: 100 });
  }
}

function installDeterministicCostMeter(ctx: ReturnType<typeof createTestContext>): void {
  const meter = new DeterministicCostMeter(ctx.store);
  for (const service of [ctx.personas, ctx.storybooks]) {
    Object.defineProperty(service, "costMeter", { value: meter, writable: false });
  }
}

async function runDeterministicComposition(root = process.cwd()): Promise<DeterministicReport> {
  const fal = new FakeFal();
  const ctx = createTestContext({ fal });
  installDeterministicCostMeter(ctx);
  const stages: StageEvidence[] = [];
  const failures: string[] = [];
  const errors: string[] = [];
  const pass = (id: StageEvidence["id"], summary: string, details?: StageEvidence["details"]) => {
    const definition = RELEASE_GATE_FLOW.find((item) => item.id === id)!;
    stages.push({ id, label: definition.label, status: "passed", summary, details });
  };

  try {
    const guardian = ctx.onboarding.ensureFamilyForNewUser(
      "release-gate-auth-user",
      "guardian-release-gate@example.test",
      "US_IOS",
    );
    assertCondition(ctx.store.getMemberByAuthUserId("release-gate-auth-user")?.id === guardian.id, "sign-in readback failed");
    pass("sign-in", "The authenticated user resolved to one Guardian Family", { family: guardian.familyId.length > 0, guardian: true });

    const trial = ctx.subscriptions.activateTrial(guardian.familyId);
    assertCondition(ctx.subscriptions.isActive(guardian.familyId), "trial entitlement was not active");
    assertCondition(ctx.entitlements.getPlan(guardian.familyId) === "just_us", "wrong server plan");
    pass("entitlement", "The server-authoritative trial and Just Us entitlement were read back", { active: true, plan: "just_us", trialEndsAt: trial.trialEndsAt != null });

    const consent = ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US_IOS", "email_plus");
    assertCondition(consent.method === "email_plus", "native consent method was not recorded");
    pass("consent", "Email-Plus VPC consent was Family-linked before Baby Persona creation", { method: consent.method ?? "", jurisdiction: consent.jurisdiction });

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Pip", topics: ["curious", "kind"], isFictional: true },
    });
    assertCondition(ctx.store.getCharacter(character.id, guardian.id)?.id === character.id, "Character was not persisted at the service boundary");
    pass("character", "A fictional Character was moderated and persisted", { created: true });

    const babyPersona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(0x11), goodPhoto(0x12), goodPhoto(0x13)],
    });
    ctx.liveness.shouldMatch = true;
    const adultPersona = await ctx.rawPersonas.createAdult({
      memberId: guardian.id,
      displayName: "Mama",
      photos: [goodPhoto(0x21), goodPhoto(0x22), goodPhoto(0x23)],
      selfie: Buffer.from("synthetic-consenting-adult-selfie"),
    });
    ctx.rawPersonas.acceptLikeness(babyPersona.id, guardian.id);
    ctx.rawPersonas.acceptLikeness(adultPersona.id, guardian.id);
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    assertCondition(
      [babyPersona, adultPersona].every((persona) => persona.status === "ready" && persona.likenessConfirmed === true),
      "Persona creation did not complete through the real service composition",
    );
    pass("persona", "Baby and Adult Persona creation crossed moderation, training, and likeness acceptance", { personas: 2, fakeOwnedLoraArtifacts: true });

    const bedtimeBrief = {
      starringPersonaIds: [babyPersona.id, adultPersona.id],
      babyId: baby.id,
      storyType: "bedtime" as const,
      theme: "A moonlit garden",
    };
    const bedtime = await ctx.storybooks.generate(guardian.id, bedtimeBrief);
    assertCondition(ctx.store.getStorybook(bedtime.id, guardian.id)?.status === "generating", "Story enqueue did not persist generating state");
    pass("storybook-enqueue", "The Storybook was persisted before workflow execution", { status: "generating", queued: true });
    await ctx.workflow.drain();
    const bedtimeFinal = ctx.store.getStorybook(bedtime.id, guardian.id)!;
    const bedtimePages = ctx.store.getPagesForStorybook(bedtime.id);
    assertCondition(bedtimeFinal.status === "draft" && bedtimePages.length === 12, "Bedtime Story did not produce a draft with twelve Pages");
    pass("bedtime-text", "Bedtime text succeeded at the Storybook composition seam", { storyType: "bedtime", pages: 12 });

    const learning = await ctx.storybooks.generate(guardian.id, {
      ...bedtimeBrief,
      storyType: "learning",
      theme: "Counting moonbeams",
    });
    await ctx.workflow.drain();
    const learningFinal = ctx.store.getStorybook(learning.id, guardian.id)!;
    const learningGeneration = ctx.store.getPersistedGeneration(learning.id);
    assertCondition(learningFinal.status === "draft" && learningGeneration?.story.pages.length === 12, "Learning Story did not produce twelve Pages");
    pass("learning-text", "Learning text succeeded through the same workflow composition", { storyType: "learning", pages: 12 });

    assertCondition(
      bedtimePages.every((page) => page.personaCount === 2 && page.generationStatus === "ready"),
      "two-Persona Page requests did not retain both selected Personas",
    );
    pass("two-persona", "The deterministic Page seam carried both Persona LoRA references", { personasPerPage: 2, evidenceSource: "deterministic" });
    assertCondition(bedtimePages.map((page) => page.index).join(",") === Array.from({ length: 12 }, (_, index) => index).join(","), "Pages were not ordered");
    pass("twelve-pages", "The Storybook persisted exactly twelve ordered Pages", { pageCount: bedtimePages.length });

    const progress = deriveStorybookProgress({
      status: bedtimeFinal.status,
      brief: bedtimeFinal.brief,
      pages: bedtimePages,
      hasPersistedText: ctx.store.getPersistedGeneration(bedtime.id) !== undefined,
    });
    assertCondition(progress.phase === "complete" && progress.pagesReady === 12 && progress.pagesTotal === 12 && bedtimePages.every((page) => page.text.trim().length > 0), "reader projection was not text-readable");
    pass("reader", "The reader projection exposes complete progress and text-readable Pages", { phase: progress.phase, pagesReady: progress.pagesReady, pagesTotal: progress.pagesTotal });

    ctx.storybooks.finalize(guardian.id, bedtime.id);
    const pdf = await ctx.exportSvc.exportPdf(guardian.id, bedtime.id);
    assertCondition(pdf.length > 0 && pdf.toString("utf8").includes("A moonlit garden"), "PDF export was empty or missing Story text");
    pass("finalize-pdf", "The draft finalized and produced a non-empty PDF keepsake", { finalized: true, pdfBytes: pdf.length });

    const note = ctx.moments.create({ memberId: guardian.id, babyId: baby.id, body: "Maya counted three moonbeams", occurredOn: "2026-08-02", momentType: "milestone" });
    const timeline = ctx.moments.list(guardian.id, baby.id);
    assertCondition(timeline.length === 1 && timeline[0]?.id === note.id, "Daily Note was not visible in the Journal timeline");
    pass("daily-notes", "Daily Notes capture and Family-scoped timeline read succeeded", { timelineEntries: timeline.length });

    const originalResponse = ctx.anthropic.response;
    ctx.anthropic.response = { ...originalResponse, text: "", pages: [], scenes: [] };
    const invalidTextBook = await ctx.storybooks.generate(guardian.id, { ...bedtimeBrief, theme: "invalid text recovery" });
    await ctx.workflow.drain();
    const invalidTextStatus = ctx.store.getStorybook(invalidTextBook.id, guardian.id)?.status;
    const invalidTextAllowanceReleased = ctx.storyCap.getReservationAudit(invalidTextBook.id)?.status === "released";
    ctx.anthropic.response = originalResponse;
    assertCondition(invalidTextStatus === "failed" && invalidTextAllowanceReleased, "invalid text did not reach terminal failed with a released allowance");

    fal.failPages.add(1);
    const failedPageBook = await ctx.storybooks.generate(guardian.id, { ...bedtimeBrief, theme: "one recoverable page" });
    await ctx.workflow.drain();
    fal.failPages.delete(1);
    const failedPage = ctx.store.getPagesForStorybook(failedPageBook.id).find((page) => page.generationStatus === "failed");
    assertCondition(failedPage !== undefined, "failed Page was not retained as a recovery hole");
    await ctx.blobs.put(
      `books/${guardian.familyId}/${failedPageBook.id}/page-${failedPage.index}.png.attempt-0.raw`,
      Buffer.from("deterministic-failed-page-artifact"),
    );
    const activeReservationsBeforeRecovery = [...ctx.store.storyAllowanceReservations.values()].filter((reservation) => reservation.status === "reserved" || reservation.status === "committed").length;
    ctx.storybooks.recoverPage(guardian.id, failedPage.id);
    await ctx.workflow.drain();
    const recovered = ctx.store.pages.get(failedPage.id);
    const activeReservationsAfterRecovery = [...ctx.store.storyAllowanceReservations.values()].filter((reservation) => reservation.status === "reserved" || reservation.status === "committed").length;
    assertCondition(recovered?.generationStatus === "ready", "failed Page did not recover");
    assertCondition(activeReservationsAfterRecovery === activeReservationsBeforeRecovery, "Page recovery reserved another Story allowance");
    pass("failure-recovery", "Invalid text failed before image work and a failed Page recovered in place", { invalidTextStatus: invalidTextStatus ?? "missing", invalidTextAllowanceReleased, recoveredPageStatus: recovered.generationStatus, failedPages: 1, allowanceDelta: activeReservationsAfterRecovery - activeReservationsBeforeRecovery });

    const costEntries = [...ctx.store.providerCostLedgerEntries.values()].filter((entry) => entry.owningEntityIds.familyId === guardian.familyId);
    const providerEvidence: ProviderEvidence = {
      source: "deterministic",
      requestIds: costEntries.map((entry) => entry.requestId),
      attempts: costEntries.length,
      failures: costEntries.filter((entry) => entry.outcome !== "succeeded").length,
      estimatedCostUsd: costEntries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0),
      actualCostUsd: costEntries.reduce((sum, entry) => sum + (entry.actualCostUsd ?? 0), 0),
      actualCostReconciled: false,
      entries: costEntries.map((entry) => ({
        requestId: entry.requestId,
        provider: entry.provider,
        endpoint: safeProviderEndpoint(entry.endpoint),
        model: entry.model,
        pricingVersion: entry.pricingVersion,
        outcome: entry.outcome,
        estimatedCostUsd: entry.estimatedCostUsd,
        actualCostUsd: entry.actualCostUsd,
      })),
    };
    assertCondition(providerEvidence.requestIds.length > 0 && providerEvidence.failures > 0 && providerEvidence.estimatedCostUsd > 0, "provider evidence did not contain IDs, failures, and non-zero estimated cost");
    pass("provider-cost", "The secret-free ledger published deterministic provider IDs, routes, outcomes, and estimated cost", { attempts: providerEvidence.attempts, failures: providerEvidence.failures, estimatedCostUsd: providerEvidence.estimatedCostUsd, actualCostReconciled: false });

    const otherGuardian = ctx.onboarding.ensureFamilyForNewUser("release-gate-other-family", "other-release-gate@example.test", "US_IOS");
    let denied = false;
    try {
      ctx.store.getStorybook(bedtime.id, otherGuardian.id);
    } catch (error) {
      denied = error instanceof RlsViolationError;
    }
    assertCondition(denied, "cross-Family Storybook read was not denied");
    pass("rls", "The in-memory RLS composition denied a cross-Family Storybook read", { denied: true });

    const providerRequestId = "release-gate-provider-request";
    const loraKey = `lora/${guardian.familyId}/owned-release-gate.safetensors`;
    const configKey = `lora/${guardian.familyId}/owned-release-gate.json`;
    await ctx.blobs.put(loraKey, Buffer.from("owned-lora-artifact"));
    await ctx.blobs.put(configKey, Buffer.from("owned-lora-config"));
    ctx.store.falTrainingRequests.set(providerRequestId, {
      requestId: providerRequestId,
      familyId: guardian.familyId,
      personaId: babyPersona.id,
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: "release-gate-training",
      status: "ready",
      loraWeightKey: loraKey,
      configurationKey: configKey,
      createdAt: new Date("2026-08-02T00:00:00Z"),
      updatedAt: new Date("2026-08-02T00:00:00Z"),
    });
    const deletedProviderArtifacts: string[] = [];
    const deletion = await new HardDeleteService(ctx.store, ctx.blobs, ctx.notifications, {
      deleteArtifact: async (key) => { deletedProviderArtifacts.push(key); },
    }).hardDelete(guardian.id);
    assertCondition(!ctx.store.familyDataExists(guardian.familyId), "Hard-delete left deleted Family data");
    assertCondition(ctx.store.familyDataExists(otherGuardian.familyId), "Hard-delete crossed into another Family");
    assertCondition(deletion.provider.limitations.length === 0 && deletedProviderArtifacts.length === 2, "Hard-delete did not delete tracked provider artifacts");
    pass("hard-delete", "Hard-delete removed the Family database/blob/provider inventory without crossing the tenant boundary", { deletedFamilyDataRemaining: false, otherFamilyDataRemaining: true, deletedProviderArtifacts: deletedProviderArtifacts.length });

    const cutSurfaces = cutSurfaceEvidence(root);
    assertCondition(cutSurfaces.every((surface) => surface.status === "inert"), "a cut surface is reachable");
    pass("cut-surfaces", "Audio, video, invitations, share links, and heavy Journal machinery remain inert", { inertSurfaces: cutSurfaces.length });

    const twoPersona = {
      status: "blocked" as const,
      realOwnedLoraArtifacts: false,
      blockedStep: LIVE_EVIDENCE_MISSING_STEPS.realOwnedLoraArtifacts,
    };
    failures.push("Invalid Story text reached terminal failed before illustration work");
    failures.push("A failed Page remained recoverable and recovered without another Story allowance reservation");
    const passed = stages.length === RELEASE_GATE_FLOW.length && errors.length === 0;
    return { status: passed ? "passed" : "failed", flowChecklist: { total: RELEASE_GATE_FLOW.length, passed: stages.filter((stage) => stage.status === "passed").length, failed: stages.filter((stage) => stage.status === "failed").length, pending: RELEASE_GATE_FLOW.length - stages.length }, stages, failures, errors, providerEvidence, twoPersona, cutSurfaces }; 
  } catch (error) {
    const message = cleanText(error instanceof Error ? error.message : error);
    errors.push(message);
    const missing = RELEASE_GATE_FLOW.filter((definition) => !stages.some((stage) => stage.id === definition.id));
    for (const definition of missing) stages.push({ id: definition.id, label: definition.label, status: "failed", summary: "Not reached after an earlier deterministic failure" });
    const emptyEvidence: ProviderEvidence = { source: "deterministic", requestIds: [], attempts: 0, failures: 1, estimatedCostUsd: 0, actualCostUsd: 0, actualCostReconciled: false, entries: [] };
    return { status: "failed", flowChecklist: { total: RELEASE_GATE_FLOW.length, passed: stages.filter((stage) => stage.status === "passed").length, failed: stages.filter((stage) => stage.status === "failed").length, pending: 0 }, stages, failures, errors, providerEvidence: emptyEvidence, twoPersona: { status: "blocked", realOwnedLoraArtifacts: false, blockedStep: LIVE_EVIDENCE_MISSING_STEPS.realOwnedLoraArtifacts }, cutSurfaces: cutSurfaceEvidence(root) }; 
  }
}

export async function runReachableReleaseGate(options: { root?: string; liveEvidence?: NativeEvidence } = {}): Promise<ReachableReleaseGateReport> {
  const root = options.root ?? process.cwd();
  const [deterministic, releaseProfile] = await Promise.all([
    runDeterministicComposition(root),
    Promise.resolve(scanReleaseProfile(root)),
  ]);
  const liveEvidence = evaluateLiveEvidence(options.liveEvidence);
  const failures = [
    ...deterministic.errors,
    ...(releaseProfile.status === "failed" ? releaseProfile.violations.map((violation) => `${violation.file}: ${violation.rule} (${violation.match})`) : []),
  ];
  const missingEvidence = liveEvidence.missingEvidence;
  const releaseEvidenceEligible = deterministic.status === "passed" && releaseProfile.status === "passed" && liveEvidence.status === "passed";
  const status = failures.length > 0 ? "failed" : releaseEvidenceEligible ? "passed" : "blocked";
  return {
    deterministic,
    releaseProfile,
    liveEvidence,
    decision: {
      status,
      failures,
      missingEvidence,
      rationale: status === "passed"
        ? "Deterministic composition, release-profile scan, and separately-owned live evidence all passed."
        : status === "failed"
          ? `The release gate is closed by a deterministic or release-profile failure. ${failures.join(" ")}`
          : `BLOCKED: deterministic proof passed, but live/native evidence is missing. ${missingEvidence.join(" ")}`,
    },
    releaseEvidenceEligible,
  };
}

async function main() {
  const report = await runReachableReleaseGate();
  console.log(JSON.stringify({
    decision: report.decision,
    deterministic: {
      status: report.deterministic.status,
      flowChecklist: report.deterministic.flowChecklist,
      failures: report.deterministic.failures,
      errors: report.deterministic.errors,
      providerEvidence: report.deterministic.providerEvidence,
      twoPersona: report.deterministic.twoPersona,
      cutSurfaces: report.deterministic.cutSurfaces,
    },
    releaseProfile: report.releaseProfile,
    liveEvidence: report.liveEvidence,
    releaseEvidenceEligible: report.releaseEvidenceEligible,
  }, null, 2));
  process.exitCode = report.decision.status === "passed" ? 0 : report.decision.status === "blocked" ? 2 : 1;
}

if (process.argv[1] && relative(process.cwd(), process.argv[1]) === "tools/release-gate.ts") {
  void main();
}
