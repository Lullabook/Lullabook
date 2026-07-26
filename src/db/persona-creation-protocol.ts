import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlobStore, WorkflowAdapter } from "@/adapters/types";
import { createServiceClient } from "@/lib/supabase";

export interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
}

export type AuthenticatedSqlRunner = <Row extends Record<string, unknown> = Record<string, unknown>>(
  authUserId: string,
  text: string,
  values?: unknown[],
) => Promise<SqlResult<Row>>;

export type ServiceSqlRunner = <Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<SqlResult<Row>>;

export interface PersonaCreationReservationInput {
  kind: "baby" | "adult";
  displayName: string;
  photoCount: number;
  /** SHA-256 of the canonical, byte-free request manifest. */
  requestFingerprint: string;
  baby?: { displayName: string; birthDate?: string | null; rosterScope?: "shared" | "isolated" };
  bond?: { relationship: string; babyCallsThem: string; theyCallBaby: string };
  /** A prior durable subject-consent receipt. Omit for the transactional Adult self-consent RPC. */
  adultConsentReceiptId?: string;
}

export type PersonaCreationState = "prepared" | "uploaded" | "finalized" | "aborted" | "expired";

export interface PersonaCreationReservation {
  id: string;
  familyId: string;
  state: PersonaCreationState;
  photoKeys: string[];
  /** Durable identity of the accepted/current upload attempt, needed for retry compensation. */
  uploadAttemptId?: string;
}

export interface PersonaCreationUpload extends Pick<PersonaCreationReservation, "id" | "state"> {
  attemptId: string;
}

export interface PersonaCreationPhotoManifest {
  key: string;
  sha256: string;
  size: number;
}

export interface PersonaCreationCleanupClaim {
  id: string;
  familyId: string;
  photoKeys: string[];
  cleanupToken: string;
}

export interface PersonaCreationUploadCleanupClaim extends PersonaCreationCleanupClaim {
  reservationId: string;
}

export interface FinalizedPersonaCreation {
  id: string;
  familyId: string;
  personaId: string;
  state: "finalized";
  outboxEventId: string;
  photoKeys: string[];
}

export interface PersonaCreationOutboxEvent {
  id: string;
  familyId: string;
  personaId: string;
  reservationId: string;
  leaseToken: string;
}

export interface PersonaCreationRepository {
  prepare(input: PersonaCreationReservationInput): Promise<PersonaCreationReservation>;
  claimUpload(reservationId: string, attemptId: string): Promise<PersonaCreationReservation | null>;
  markUploaded(
    reservationId: string,
    attemptId: string,
    photoManifest: PersonaCreationPhotoManifest[],
  ): Promise<Pick<PersonaCreationReservation, "id" | "state">>;
  claimCompensation(reservationId: string, attemptId: string): Promise<PersonaCreationCleanupClaim | null>;
  completeCleanup(reservationId: string, cleanupToken: string): Promise<void>;
  releaseCleanup(reservationId: string, cleanupToken: string): Promise<void>;
  abort(reservationId: string): Promise<void>;
  finalize(reservationId: string): Promise<FinalizedPersonaCreation>;
  readReservation(reservationId: string): Promise<PersonaCreationReservation | null>;
  readFinalized(reservationId: string): Promise<FinalizedPersonaCreation>;
  readFinalizedByEventId(outboxEventId: string): Promise<FinalizedPersonaCreation>;
}

export interface PersonaCreationWorkerRepository {
  claimExpiredUploadAttempts(limit?: number, leaseSeconds?: number): Promise<PersonaCreationUploadCleanupClaim[]>;
  markUploadAttemptCleanupComplete(attemptId: string, cleanupToken: string): Promise<void>;
  releaseUploadAttemptCleanup(attemptId: string, cleanupToken: string): Promise<void>;
  claimExpiredReservations(limit?: number, leaseSeconds?: number): Promise<PersonaCreationCleanupClaim[]>;
  markExpiredCleanupComplete(reservationId: string, cleanupToken: string): Promise<void>;
  releaseExpiredCleanup(reservationId: string, cleanupToken: string): Promise<void>;
  claimOutbox(leaseSeconds?: number): Promise<PersonaCreationOutboxEvent | null>;
  claimOutboxForReservation(
    reservationId: string,
    leaseSeconds?: number,
  ): Promise<PersonaCreationOutboxEvent | null>;
  markOutboxSent(outboxEventId: string, leaseToken: string): Promise<void>;
}

interface ReservationRow extends Record<string, unknown> {
  id: string;
  family_id: string;
  state: PersonaCreationState;
  photo_keys: unknown;
  upload_attempt_id?: string | null;
}

interface FinalizedRow extends Record<string, unknown> {
  id: string;
  family_id: string;
  persona_id: string;
  state: "finalized";
  outbox_event_id: string;
  photo_keys: unknown;
}

interface CleanupRow extends Record<string, unknown> {
  id: string;
  family_id: string;
  photo_keys: unknown;
  cleanup_lease_token: string;
}

interface UploadCleanupRow extends CleanupRow {
  reservation_id: string;
}

interface OutboxEventRow extends Record<string, unknown> {
  id: string;
  family_id: string;
  reservation_id: string;
  persona_id: string;
  lease_token: string;
}

/**
 * PostgreSQL integration adapter. User intent runs with the authenticated role;
 * upload attestation, finalization, compensation, and authoritative reads use a
 * separate service-role connection so a bearer client cannot forge them.
 */
export class PostgresPersonaCreationRepository implements PersonaCreationRepository {
  constructor(
    private readonly queryAsUser: AuthenticatedSqlRunner,
    private readonly authUserId: string,
    private readonly queryAsService?: ServiceSqlRunner,
  ) {}

  async prepare(input: PersonaCreationReservationInput): Promise<PersonaCreationReservation> {
    const isNewAdultConsent = input.kind === "adult" && !input.adultConsentReceiptId;
    const result = isNewAdultConsent
      ? await this.queryAsUser<ReservationRow>(
          this.authUserId,
          "select * from app_prepare_adult_persona_creation($1::text, $2::integer, $3::text)",
          [input.displayName, input.photoCount, input.requestFingerprint],
        )
      : await this.queryAsUser<ReservationRow>(
          this.authUserId,
          `select * from app_prepare_persona_creation(
            $1::text, $2::text, $3::integer, $4::text, $5::jsonb, $6::jsonb, $7::uuid
          )`,
          [
            input.kind,
            input.displayName,
            input.photoCount,
            input.requestFingerprint,
            input.baby ? JSON.stringify(input.baby) : null,
            input.bond ? JSON.stringify(input.bond) : null,
            input.adultConsentReceiptId ?? null,
          ],
        );
    const reservation = toReservation(requiredRow(result.rows[0], "Persona creation reservation was not returned"));
    return reservation.state === "uploaded" ? (await this.readReservation(reservation.id)) ?? reservation : reservation;
  }

  async claimUpload(reservationId: string, attemptId: string): Promise<PersonaCreationReservation | null> {
    const result = await this.service<ReservationRow>(
      "select * from app_claim_persona_creation_upload($1::uuid, $2::uuid, $3::integer)",
      [reservationId, attemptId, 300],
    );
    return result.rows[0] ? toReservation(result.rows[0]) : null;
  }

  async markUploaded(
    reservationId: string,
    attemptId: string,
    photoManifest: PersonaCreationPhotoManifest[],
  ): Promise<Pick<PersonaCreationReservation, "id" | "state">> {
    const result = await this.service<{ id: string; state: PersonaCreationState }>(
      "select * from app_mark_persona_creation_uploaded($1::uuid, $2::uuid, $3::jsonb)",
      [reservationId, attemptId, JSON.stringify(photoManifest)],
    );
    return requiredRow(result.rows[0], "Persona creation upload was not recorded");
  }

  async claimCompensation(reservationId: string, attemptId: string): Promise<PersonaCreationCleanupClaim | null> {
    const result = await this.service<CleanupRow>(
      "select * from app_claim_persona_creation_compensation($1::uuid, $2::uuid, $3::integer)",
      [reservationId, attemptId, 60],
    );
    return result.rows[0] ? toCleanupClaim(result.rows[0]) : null;
  }

  async completeCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await this.service(
      "select app_complete_persona_creation_expired_cleanup($1::uuid, $2::uuid)",
      [reservationId, cleanupToken],
    );
  }

  async releaseCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await this.service(
      "select app_release_persona_creation_cleanup($1::uuid, $2::uuid)",
      [reservationId, cleanupToken],
    );
  }

  async abort(reservationId: string): Promise<void> {
    await this.queryAsUser(this.authUserId, "select * from app_abort_persona_creation($1::uuid)", [reservationId]);
  }

  async finalize(reservationId: string): Promise<FinalizedPersonaCreation> {
    const result = await this.service<{ outbox_event_id: string }>(
      "select outbox_event_id::text from app_finalize_persona_creation($1::uuid)",
      [reservationId],
    );
    const row = requiredRow(result.rows[0], "Persona creation finalization did not produce an outbox event");
    return this.readFinalizedByEventId(row.outbox_event_id);
  }

  async readReservation(reservationId: string): Promise<PersonaCreationReservation | null> {
    const result = await this.service<ReservationRow>(
      `select id, family_id, state, photo_keys, upload_attempt_id
       from persona_creation_reservations where id = $1::uuid`,
      [reservationId],
    );
    return result.rows[0] ? toReservation(result.rows[0]) : null;
  }

  async readFinalized(reservationId: string): Promise<FinalizedPersonaCreation> {
    const result = await this.service<{ outbox_event_id: string }>(
      `select outbox.id::text as outbox_event_id
       from persona_creation_reservations reservation
       join persona_creation_outbox outbox on outbox.reservation_id = reservation.id
       where reservation.id = $1::uuid and reservation.state = 'finalized'`,
      [reservationId],
    );
    const row = requiredRow(result.rows[0], "Finalized Persona creation was not found");
    return this.readFinalizedByEventId(row.outbox_event_id);
  }

  async readFinalizedByEventId(outboxEventId: string): Promise<FinalizedPersonaCreation> {
    const result = await this.service<FinalizedRow>(
      "select * from app_read_finalized_persona_creation_by_event($1::uuid)",
      [outboxEventId],
    );
    return toFinalized(requiredRow(result.rows[0], "Finalized Persona creation event was not found"));
  }

  private service<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<SqlResult<Row>> {
    if (!this.queryAsService) {
      throw new Error("Persona creation state transitions require a service-role SQL runner");
    }
    return this.queryAsService<Row>(text, values);
  }
}

/** Service-role worker boundary for cleanup claims and outbox acknowledgements. */
export class PostgresPersonaCreationWorkerRepository implements PersonaCreationWorkerRepository {
  constructor(private readonly queryAsService: ServiceSqlRunner) {}

  async claimExpiredUploadAttempts(limit = 25, leaseSeconds = 60): Promise<PersonaCreationUploadCleanupClaim[]> {
    const result = await this.queryAsService<UploadCleanupRow>(
      "select * from app_claim_persona_creation_upload_attempt_cleanup($1::integer, $2::integer)",
      [limit, leaseSeconds],
    );
    return result.rows.map(toUploadCleanupClaim);
  }

  async markUploadAttemptCleanupComplete(attemptId: string, cleanupToken: string): Promise<void> {
    await this.queryAsService(
      "select app_complete_persona_creation_upload_attempt_cleanup($1::uuid, $2::uuid)",
      [attemptId, cleanupToken],
    );
  }

  async releaseUploadAttemptCleanup(attemptId: string, cleanupToken: string): Promise<void> {
    await this.queryAsService(
      "select app_release_persona_creation_upload_attempt_cleanup($1::uuid, $2::uuid)",
      [attemptId, cleanupToken],
    );
  }

  async claimExpiredReservations(limit = 25, leaseSeconds = 60): Promise<PersonaCreationCleanupClaim[]> {
    const result = await this.queryAsService<CleanupRow>(
      "select * from app_claim_expired_persona_creation_reservations($1::integer, $2::integer)",
      [limit, leaseSeconds],
    );
    return result.rows.map(toCleanupClaim);
  }

  async markExpiredCleanupComplete(reservationId: string, cleanupToken: string): Promise<void> {
    await this.queryAsService(
      "select app_complete_persona_creation_expired_cleanup($1::uuid, $2::uuid)",
      [reservationId, cleanupToken],
    );
  }

  async releaseExpiredCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await this.queryAsService(
      "select app_release_persona_creation_cleanup($1::uuid, $2::uuid)",
      [reservationId, cleanupToken],
    );
  }

  async claimOutbox(leaseSeconds = 60): Promise<PersonaCreationOutboxEvent | null> {
    const result = await this.queryAsService<OutboxEventRow>(
      "select * from app_claim_persona_creation_outbox($1::integer)",
      [leaseSeconds],
    );
    return toOutboxEvent(result.rows[0]);
  }

  async claimOutboxForReservation(
    reservationId: string,
    leaseSeconds = 60,
  ): Promise<PersonaCreationOutboxEvent | null> {
    const result = await this.queryAsService<OutboxEventRow>(
      "select * from app_claim_persona_creation_outbox_for_reservation($1::uuid, $2::integer)",
      [reservationId, leaseSeconds],
    );
    return toOutboxEvent(result.rows[0]);
  }

  async markOutboxSent(outboxEventId: string, leaseToken: string): Promise<void> {
    await this.queryAsService(
      "select app_mark_persona_creation_outbox_sent($1::uuid, $2::uuid)",
      [outboxEventId, leaseToken],
    );
  }
}

/**
 * Server-only Supabase repository. The caller's cookie client prepares/cancels;
 * worker state changes use the service client lazily so the public RPC grants
 * remain closed without moving LUL-103's action or training ownership.
 */
export class SupabasePersonaCreationRepository implements PersonaCreationRepository, PersonaCreationWorkerRepository {
  private workerClient?: SupabaseClient;

  constructor(
    private readonly authenticatedClient: SupabaseClient,
    serviceClient?: SupabaseClient,
  ) {
    this.workerClient = serviceClient;
  }

  async prepare(input: PersonaCreationReservationInput): Promise<PersonaCreationReservation> {
    const isNewAdultConsent = input.kind === "adult" && !input.adultConsentReceiptId;
    const rows = await this.authRpc<ReservationRow>(
      isNewAdultConsent ? "app_prepare_adult_persona_creation" : "app_prepare_persona_creation",
      isNewAdultConsent
        ? {
            p_display_name: input.displayName,
            p_photo_count: input.photoCount,
            p_request_fingerprint: input.requestFingerprint,
          }
        : {
            p_kind: input.kind,
            p_display_name: input.displayName,
            p_photo_count: input.photoCount,
            p_request_fingerprint: input.requestFingerprint,
            p_baby: input.baby ?? null,
            p_bond: input.bond ?? null,
            p_adult_consent_receipt_id: input.adultConsentReceiptId ?? null,
          },
    );
    const reservation = toReservation(requiredRow(rows[0], "Persona creation reservation was not returned"));
    return reservation.state === "uploaded" ? (await this.readReservation(reservation.id)) ?? reservation : reservation;
  }

  async claimUpload(reservationId: string, attemptId: string): Promise<PersonaCreationReservation | null> {
    const rows = await this.serviceRpc<ReservationRow>("app_claim_persona_creation_upload", {
      p_reservation_id: reservationId,
      p_upload_attempt_id: attemptId,
      p_lease_seconds: 300,
    });
    return rows[0] ? toReservation(rows[0]) : null;
  }

  async markUploaded(
    reservationId: string,
    attemptId: string,
    photoManifest: PersonaCreationPhotoManifest[],
  ): Promise<Pick<PersonaCreationReservation, "id" | "state">> {
    const rows = await this.serviceRpc<{ id: string; state: PersonaCreationState }>(
      "app_mark_persona_creation_uploaded",
      {
        p_reservation_id: reservationId,
        p_upload_attempt_id: attemptId,
        p_photo_manifest: photoManifest,
      },
    );
    return requiredRow(rows[0], "Persona creation upload was not recorded");
  }

  async claimCompensation(reservationId: string, attemptId: string): Promise<PersonaCreationCleanupClaim | null> {
    const rows = await this.serviceRpc<CleanupRow>("app_claim_persona_creation_compensation", {
      p_reservation_id: reservationId,
      p_upload_attempt_id: attemptId,
      p_lease_seconds: 60,
    });
    return rows[0] ? toCleanupClaim(rows[0]) : null;
  }

  async completeCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await this.serviceRpc("app_complete_persona_creation_expired_cleanup", {
      p_reservation_id: reservationId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async releaseCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await this.serviceRpc("app_release_persona_creation_cleanup", {
      p_reservation_id: reservationId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async abort(reservationId: string): Promise<void> {
    await this.authRpc("app_abort_persona_creation", { p_reservation_id: reservationId });
  }

  async finalize(reservationId: string): Promise<FinalizedPersonaCreation> {
    const rows = await this.serviceRpc<{ outbox_event_id: string }>("app_finalize_persona_creation", {
      p_reservation_id: reservationId,
    });
    const row = requiredRow(rows[0], "Persona creation finalization did not produce an outbox event");
    return this.readFinalizedByEventId(row.outbox_event_id);
  }

  async readReservation(reservationId: string): Promise<PersonaCreationReservation | null> {
    const { data, error } = await this.service()
      .from("persona_creation_reservations")
      .select("id, family_id, state, photo_keys, upload_attempt_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (error) throw new Error(`read Persona creation reservation failed: ${error.message}`);
    return data ? toReservation(data as ReservationRow) : null;
  }

  async readFinalized(reservationId: string): Promise<FinalizedPersonaCreation> {
    const { data: row, error } = await this.service()
      .from("persona_creation_outbox")
      .select("id")
      .eq("reservation_id", reservationId)
      .maybeSingle();
    if (error) throw new Error(`read Persona creation outbox failed: ${error.message}`);
    if (!row) throw new Error("Finalized Persona creation was not found");
    return this.readFinalizedByEventId(String(row.id));
  }

  async readFinalizedByEventId(outboxEventId: string): Promise<FinalizedPersonaCreation> {
    const rows = await this.serviceRpc<FinalizedRow>("app_read_finalized_persona_creation_by_event", {
      p_outbox_event_id: outboxEventId,
    });
    return toFinalized(requiredRow(rows[0], "Finalized Persona creation event was not found"));
  }

  async claimExpiredUploadAttempts(limit = 25, leaseSeconds = 60): Promise<PersonaCreationUploadCleanupClaim[]> {
    const rows = await this.serviceRpc<UploadCleanupRow>("app_claim_persona_creation_upload_attempt_cleanup", {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    return rows.map(toUploadCleanupClaim);
  }

  async markUploadAttemptCleanupComplete(attemptId: string, cleanupToken: string): Promise<void> {
    await this.serviceRpc("app_complete_persona_creation_upload_attempt_cleanup", {
      p_upload_attempt_id: attemptId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async releaseUploadAttemptCleanup(attemptId: string, cleanupToken: string): Promise<void> {
    await this.serviceRpc("app_release_persona_creation_upload_attempt_cleanup", {
      p_upload_attempt_id: attemptId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async claimExpiredReservations(limit = 25, leaseSeconds = 60): Promise<PersonaCreationCleanupClaim[]> {
    const rows = await this.serviceRpc<CleanupRow>("app_claim_expired_persona_creation_reservations", {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    return rows.map(toCleanupClaim);
  }

  async markExpiredCleanupComplete(reservationId: string, cleanupToken: string): Promise<void> {
    await this.completeCleanup(reservationId, cleanupToken);
  }

  async releaseExpiredCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await this.releaseCleanup(reservationId, cleanupToken);
  }

  async claimOutbox(leaseSeconds = 60): Promise<PersonaCreationOutboxEvent | null> {
    const rows = await this.serviceRpc<OutboxEventRow>("app_claim_persona_creation_outbox", {
      p_lease_seconds: leaseSeconds,
    });
    return toOutboxEvent(rows[0]);
  }

  async claimOutboxForReservation(
    reservationId: string,
    leaseSeconds = 60,
  ): Promise<PersonaCreationOutboxEvent | null> {
    const rows = await this.serviceRpc<OutboxEventRow>("app_claim_persona_creation_outbox_for_reservation", {
      p_reservation_id: reservationId,
      p_lease_seconds: leaseSeconds,
    });
    return toOutboxEvent(rows[0]);
  }

  async markOutboxSent(outboxEventId: string, leaseToken: string): Promise<void> {
    await this.serviceRpc("app_mark_persona_creation_outbox_sent", {
      p_outbox_id: outboxEventId,
      p_lease_token: leaseToken,
    });
  }

  private service(): SupabaseClient {
    this.workerClient ??= createServiceClient();
    return this.workerClient;
  }

  private async authRpc<Row extends Record<string, unknown>>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Row[]> {
    return runRpc<Row>(this.authenticatedClient, name, args);
  }

  private async serviceRpc<Row extends Record<string, unknown>>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Row[]> {
    return runRpc<Row>(this.service(), name, args);
  }
}

/** Service-role Supabase repository for scheduled recovery and dispatch work. */
export class SupabasePersonaCreationWorkerRepository implements PersonaCreationWorkerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async claimExpiredUploadAttempts(limit = 25, leaseSeconds = 60): Promise<PersonaCreationUploadCleanupClaim[]> {
    const rows = await runRpc<UploadCleanupRow>(this.client, "app_claim_persona_creation_upload_attempt_cleanup", {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    return rows.map(toUploadCleanupClaim);
  }

  async markUploadAttemptCleanupComplete(attemptId: string, cleanupToken: string): Promise<void> {
    await runRpc(this.client, "app_complete_persona_creation_upload_attempt_cleanup", {
      p_upload_attempt_id: attemptId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async releaseUploadAttemptCleanup(attemptId: string, cleanupToken: string): Promise<void> {
    await runRpc(this.client, "app_release_persona_creation_upload_attempt_cleanup", {
      p_upload_attempt_id: attemptId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async claimExpiredReservations(limit = 25, leaseSeconds = 60): Promise<PersonaCreationCleanupClaim[]> {
    const rows = await runRpc<CleanupRow>(this.client, "app_claim_expired_persona_creation_reservations", {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    return rows.map(toCleanupClaim);
  }

  async markExpiredCleanupComplete(reservationId: string, cleanupToken: string): Promise<void> {
    await runRpc(this.client, "app_complete_persona_creation_expired_cleanup", {
      p_reservation_id: reservationId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async releaseExpiredCleanup(reservationId: string, cleanupToken: string): Promise<void> {
    await runRpc(this.client, "app_release_persona_creation_cleanup", {
      p_reservation_id: reservationId,
      p_cleanup_lease_token: cleanupToken,
    });
  }

  async claimOutbox(leaseSeconds = 60): Promise<PersonaCreationOutboxEvent | null> {
    const rows = await runRpc<OutboxEventRow>(this.client, "app_claim_persona_creation_outbox", {
      p_lease_seconds: leaseSeconds,
    });
    return toOutboxEvent(rows[0]);
  }

  async claimOutboxForReservation(
    reservationId: string,
    leaseSeconds = 60,
  ): Promise<PersonaCreationOutboxEvent | null> {
    const rows = await runRpc<OutboxEventRow>(this.client, "app_claim_persona_creation_outbox_for_reservation", {
      p_reservation_id: reservationId,
      p_lease_seconds: leaseSeconds,
    });
    return toOutboxEvent(rows[0]);
  }

  async markOutboxSent(outboxEventId: string, leaseToken: string): Promise<void> {
    await runRpc(this.client, "app_mark_persona_creation_outbox_sent", {
      p_outbox_id: outboxEventId,
      p_lease_token: leaseToken,
    });
  }
}

/** Writes only moderated bytes after atomically acquiring one upload attempt. */
export class PersonaCreationProtocol {
  constructor(
    private readonly repository: PersonaCreationRepository,
    private readonly blobs: BlobStore,
    private readonly worker?: PersonaCreationWorkerRepository,
  ) {}

  async createFromModeratedPhotos(
    input: PersonaCreationReservationInput,
    photos: Buffer[],
  ): Promise<FinalizedPersonaCreation> {
    const reservation = await this.repository.prepare(input);
    if (reservation.state === "finalized") return this.repository.readFinalized(reservation.id);

    let upload: PersonaCreationUpload | null = null;
    if (reservation.state === "prepared") {
      upload = await this.uploadModeratedPhotos(reservation, photos);
    } else if (reservation.state === "uploaded") {
      if (!reservation.uploadAttemptId) {
        throw new Error("Uploaded Persona creation reservation is missing its compensation identity");
      }
      upload = { id: reservation.id, state: "uploaded", attemptId: reservation.uploadAttemptId };
    } else {
      throw new Error(`Persona creation reservation is ${reservation.state}`);
    }

    try {
      return await this.repository.finalize(reservation.id);
    } catch (error) {
      const committed = await this.tryReadFinalized(reservation.id);
      if (committed) return committed;
      if (upload) await this.compensate(upload.id, upload.attemptId);
      throw error;
    }
  }

  async uploadModeratedPhotos(
    reservation: PersonaCreationReservation,
    photos: Buffer[],
  ): Promise<PersonaCreationUpload> {
    if (photos.length !== reservation.photoKeys.length) {
      throw new Error("Moderated photo count does not match the Persona reservation");
    }
    assertCreationScopedKeys(reservation);

    const attemptId = randomUUID();
    const claimed = await this.repository.claimUpload(reservation.id, attemptId);
    if (!claimed) throw new Error("Persona creation upload is owned by another active attempt");
    assertCreationScopedKeys(claimed);
    if (claimed.state === "uploaded" || claimed.state === "finalized") {
      return { id: claimed.id, state: claimed.state, attemptId };
    }

    try {
      for (const [index, photo] of photos.entries()) {
        await this.blobs.put(claimed.photoKeys[index]!, photo);
      }
      const uploaded = await this.repository.markUploaded(
        claimed.id,
        attemptId,
        photos.map((photo, index) => ({
          key: claimed.photoKeys[index]!,
          sha256: createHash("sha256").update(photo).digest("hex"),
          size: photo.byteLength,
        })),
      );
      return { ...uploaded, attemptId };
    } catch (error) {
      const authoritative = await this.repository.readReservation(claimed.id).catch(() => null);
      if (authoritative?.state === "uploaded" || authoritative?.state === "finalized") {
        if (authoritative.uploadAttemptId !== attemptId) {
          await Promise.all(claimed.photoKeys.map((key) => this.blobs.delete(key))).catch(() => undefined);
        }
        return {
          id: authoritative.id,
          state: authoritative.state,
          attemptId: authoritative.uploadAttemptId ?? attemptId,
        };
      }
      let compensated = false;
      try {
        compensated = await this.compensate(claimed.id, attemptId);
      } catch {
        // A durable cleanup lease was released for the scheduled worker.
        throw error;
      }
      if (!compensated) {
        // Attempt keys are immutable and unique, so a stale loser may safely
        // delete only its own writes even after another attempt wins.
        await Promise.all(claimed.photoKeys.map((key) => this.blobs.delete(key))).catch(() => undefined);
      }
      throw error;
    }
  }

  async reconcileExpiredReservations(limit = 25): Promise<void> {
    if (!this.worker) {
      throw new Error("Persona creation recovery requires a service-role worker repository");
    }
    await new PersonaCreationRecovery(this.worker, this.blobs).reconcile(limit);
  }

  private async compensate(reservationId: string, attemptId: string): Promise<boolean> {
    const claim = await this.repository.claimCompensation(reservationId, attemptId);
    if (!claim) return false;
    assertCreationScopedKeys(claim);
    try {
      await Promise.all(claim.photoKeys.map((key) => this.blobs.delete(key)));
      await this.repository.completeCleanup(claim.id, claim.cleanupToken);
      return true;
    } catch (error) {
      await this.repository.releaseCleanup(claim.id, claim.cleanupToken).catch(() => undefined);
      throw error;
    }
  }

  private async tryReadFinalized(reservationId: string): Promise<FinalizedPersonaCreation | null> {
    try {
      return await this.repository.readFinalized(reservationId);
    } catch {
      return null;
    }
  }
}

/** Deletes only bounded, leased, creation-scoped cleanup claims. */
export class PersonaCreationRecovery {
  constructor(
    private readonly worker: PersonaCreationWorkerRepository,
    private readonly blobs: BlobStore,
  ) {}

  async reconcile(limit = 25): Promise<number> {
    let cleaned = 0;
    const attempts = await this.worker.claimExpiredUploadAttempts(limit, 60);
    for (const attempt of attempts) {
      assertCreationScopedKeys({ ...attempt, id: attempt.reservationId });
      try {
        await Promise.all(attempt.photoKeys.map((key) => this.blobs.delete(key)));
        await this.worker.markUploadAttemptCleanupComplete(attempt.id, attempt.cleanupToken);
        cleaned += 1;
      } catch (error) {
        await this.worker.releaseUploadAttemptCleanup(attempt.id, attempt.cleanupToken).catch(() => undefined);
        throw error;
      }
    }

    const reservations = await this.worker.claimExpiredReservations(limit, 60);
    for (const reservation of reservations) {
      assertCreationScopedKeys(reservation);
      try {
        await Promise.all(reservation.photoKeys.map((key) => this.blobs.delete(key)));
        await this.worker.markExpiredCleanupComplete(reservation.id, reservation.cleanupToken);
        cleaned += 1;
      } catch (error) {
        await this.worker.releaseExpiredCleanup(reservation.id, reservation.cleanupToken).catch(() => undefined);
        throw error;
      }
    }
    return cleaned;
  }
}

/** Sends the durable event before acknowledging its exact outbox lease token. */
export class PersonaCreationOutboxDispatcher {
  constructor(
    private readonly repository: PersonaCreationWorkerRepository,
    private readonly workflow: WorkflowAdapter,
  ) {}

  async dispatchOne(leaseSeconds = 60): Promise<boolean> {
    return this.dispatch(await this.repository.claimOutbox(leaseSeconds));
  }

  async dispatchReservation(reservationId: string, leaseSeconds = 60): Promise<boolean> {
    return this.dispatch(await this.repository.claimOutboxForReservation(reservationId, leaseSeconds));
  }

  private async dispatch(event: PersonaCreationOutboxEvent | null): Promise<boolean> {
    if (!event) return false;
    this.workflow.enqueue(
      "persona-creation-finalized",
      async () => undefined,
      {
        type: "persona-creation-finalized",
        eventId: event.id,
        familyId: event.familyId,
        personaId: event.personaId,
        reservationId: event.reservationId,
      },
    );
    await this.workflow.flush();
    await this.repository.markOutboxSent(event.id, event.leaseToken);
    return true;
  }
}

/**
 * Rehydrates the immutable Family/Persona/reservation graph by outbox event ID
 * before any Family store hydration or training callback is allowed to run.
 */
export class PersonaCreationOutboxConsumer {
  constructor(
    private readonly repository: Pick<PersonaCreationRepository, "readFinalizedByEventId">,
    private readonly workflow: WorkflowAdapter,
    private readonly onFinalized: (creation: FinalizedPersonaCreation) => Promise<void>,
  ) {}

  async consume(outboxEventId: string): Promise<void> {
    const finalized = await this.repository.readFinalizedByEventId(outboxEventId);
    await this.workflow.run([
      {
        name: "consume-persona-creation-finalized",
        idempotencyKey: `persona-creation-finalized:${finalized.outboxEventId}`,
        run: () => this.onFinalized(finalized),
      },
    ]);
  }
}

async function runRpc<Row extends Record<string, unknown>>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Row[]> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}

function toReservation(row: ReservationRow): PersonaCreationReservation {
  const photoKeys = checkedPhotoKeys(row.photo_keys, "Persona creation reservation returned an invalid manifest");
  return {
    id: row.id,
    familyId: row.family_id,
    state: row.state,
    photoKeys,
    ...(row.upload_attempt_id ? { uploadAttemptId: row.upload_attempt_id } : {}),
  };
}

function toCleanupClaim(row: CleanupRow): PersonaCreationCleanupClaim {
  if (!row.cleanup_lease_token) throw new Error("Persona creation cleanup claim is missing its lease token");
  return {
    id: row.id,
    familyId: row.family_id,
    photoKeys: checkedPhotoKeys(row.photo_keys, "Persona creation cleanup returned an invalid manifest"),
    cleanupToken: row.cleanup_lease_token,
  };
}

function toUploadCleanupClaim(row: UploadCleanupRow): PersonaCreationUploadCleanupClaim {
  return {
    ...toCleanupClaim(row),
    reservationId: row.reservation_id,
  };
}

function toFinalized(row: FinalizedRow): FinalizedPersonaCreation {
  return {
    id: row.id,
    familyId: row.family_id,
    personaId: row.persona_id,
    state: "finalized",
    outboxEventId: row.outbox_event_id,
    photoKeys: checkedPhotoKeys(row.photo_keys, "Finalized Persona creation returned an invalid manifest"),
  };
}

function toOutboxEvent(row: OutboxEventRow | undefined): PersonaCreationOutboxEvent | null {
  if (!row) return null;
  if (!row.lease_token) throw new Error("Persona creation outbox claim is missing its lease token");
  return {
    id: row.id,
    familyId: row.family_id,
    reservationId: row.reservation_id,
    personaId: row.persona_id,
    leaseToken: row.lease_token,
  };
}

function checkedPhotoKeys(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || !value.every(isString)) throw new Error(message);
  return value;
}

function assertCreationScopedKeys(reservation: { id: string; familyId: string; photoKeys: string[] }): void {
  const prefix = `persona-creation/${reservation.familyId}/${reservation.id}/`;
  const scopedPhoto = /^(?:attempts\/[0-9a-f-]+\/)?photos\/\d+\.jpg$/;
  if (
    reservation.photoKeys.length === 0
    || reservation.photoKeys.some((key) => !key.startsWith(prefix) || !scopedPhoto.test(key.slice(prefix.length)))
  ) {
    throw new Error("Refusing to access a non-creation-scoped Persona blob key");
  }
}

function requiredRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) throw new Error(message);
  return row;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
