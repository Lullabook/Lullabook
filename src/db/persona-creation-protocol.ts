import { createHash } from "node:crypto";
import type { BlobStore, WorkflowAdapter } from "@/adapters/types";

export interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
}

export type AuthenticatedSqlRunner = <Row extends Record<string, unknown> = Record<string, unknown>>(
  authUserId: string,
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
  /** A prior, durable subject-consent receipt; never a caller-provided boolean. */
  adultConsentReceiptId?: string;
}

export interface PersonaCreationReservation {
  id: string;
  familyId: string;
  state: "prepared" | "uploaded" | "finalized" | "aborted" | "expired";
  photoKeys: string[];
}

export interface PersonaCreationPhotoManifest {
  key: string;
  sha256: string;
  size: number;
}

export interface FinalizedPersonaCreation {
  id: string;
  personaId: string;
  state: "finalized";
  outboxEventId: string;
}

export interface PersonaCreationOutboxEvent {
  id: string;
  familyId: string;
  personaId: string;
  reservationId: string;
}

/**
 * Authenticated adapter for the database reservation RPC. This foundation does
 * not write blobs or submit workflow work; LUL-103 owns the route/action that
 * performs those steps after moderation and then invokes the remaining RPCs.
 */
export class PostgresPersonaCreationRepository {
  constructor(
    private readonly queryAsUser: AuthenticatedSqlRunner,
    private readonly authUserId: string,
  ) {}

  async prepare(input: PersonaCreationReservationInput): Promise<PersonaCreationReservation> {
    const result = await this.queryAsUser<{
      id: string;
      family_id: string;
      state: PersonaCreationReservation["state"];
      photo_keys: unknown;
    }>(
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
    const reservation = result.rows[0];
    if (!reservation || !Array.isArray(reservation.photo_keys) || !reservation.photo_keys.every(isString)) {
      throw new Error("Persona creation reservation returned an invalid manifest");
    }
    return {
      id: reservation.id,
      familyId: reservation.family_id,
      state: reservation.state,
      photoKeys: reservation.photo_keys,
    };
  }

  async markUploaded(
    reservationId: string,
    photoManifest: PersonaCreationPhotoManifest[],
  ): Promise<Pick<PersonaCreationReservation, "id" | "state">> {
    const result = await this.queryAsUser<{ id: string; state: PersonaCreationReservation["state"] }>(
      this.authUserId,
      "select * from app_mark_persona_creation_uploaded($1::uuid, $2::jsonb)",
      [reservationId, JSON.stringify(photoManifest)],
    );
    const reservation = result.rows[0];
    if (!reservation) throw new Error("Persona creation upload was not recorded");
    return reservation;
  }

  async abort(reservationId: string): Promise<void> {
    await this.queryAsUser(
      this.authUserId,
      "select * from app_abort_persona_creation($1::uuid)",
      [reservationId],
    );
  }

  async finalize(reservationId: string): Promise<FinalizedPersonaCreation> {
    const result = await this.queryAsUser<{
      id: string;
      state: FinalizedPersonaCreation["state"];
      outbox_event_id: string;
    }>(
      this.authUserId,
      "select * from app_finalize_persona_creation($1::uuid)",
      [reservationId],
    );
    const finalized = result.rows[0];
    if (!finalized?.outbox_event_id) {
      throw new Error("Persona creation finalization did not produce an outbox event");
    }
    return this.readFinalized(reservationId);
  }

  async readFinalized(reservationId: string): Promise<FinalizedPersonaCreation> {
    const result = await this.queryAsUser<{
      id: string;
      persona_id: string;
      state: FinalizedPersonaCreation["state"];
      outbox_event_id: string;
    }>(
      this.authUserId,
      `select reservation.id, reservation.persona_id, reservation.state, outbox.id as outbox_event_id
       from persona_creation_reservations reservation
       join persona_creation_outbox outbox on outbox.reservation_id = reservation.id
       where reservation.id = $1::uuid and reservation.state = 'finalized'`,
      [reservationId],
    );
    const finalized = result.rows[0];
    if (!finalized) throw new Error("Finalized Persona creation was not found");
    return {
      id: finalized.id,
      personaId: finalized.persona_id,
      state: finalized.state,
      outboxEventId: finalized.outbox_event_id,
    };
  }

  async claimExpiredReservations(): Promise<Array<Pick<PersonaCreationReservation, "id" | "familyId" | "photoKeys">>> {
    const result = await this.queryAsUser<{ id: string; family_id: string; photo_keys: unknown }>(
      this.authUserId,
      "select * from app_claim_expired_persona_creation_reservations()",
    );
    return result.rows.map((reservation) => {
      if (!Array.isArray(reservation.photo_keys) || !reservation.photo_keys.every(isString)) {
        throw new Error("Expired Persona creation reservation returned an invalid manifest");
      }
      return { id: reservation.id, familyId: reservation.family_id, photoKeys: reservation.photo_keys };
    });
  }

  async markExpiredCleanupComplete(reservationId: string): Promise<void> {
    await this.queryAsUser(
      this.authUserId,
      "select app_complete_persona_creation_expired_cleanup($1::uuid)",
      [reservationId],
    );
  }

  async claimOutbox(leaseSeconds = 60): Promise<PersonaCreationOutboxEvent | null> {
    const result = await this.queryAsUser<{
      id: string;
      family_id: string;
      reservation_id: string;
      persona_id: string;
    }>(
      this.authUserId,
      "select * from app_claim_persona_creation_outbox($1::integer)",
      [leaseSeconds],
    );
    const event = result.rows[0];
    return event
      ? {
          id: event.id,
          familyId: event.family_id,
          personaId: event.persona_id,
          reservationId: event.reservation_id,
        }
      : null;
  }

  async markOutboxSent(outboxEventId: string): Promise<void> {
    await this.queryAsUser(
      this.authUserId,
      "select app_mark_persona_creation_outbox_sent($1::uuid)",
      [outboxEventId],
    );
  }
}

/** Writes only already-moderated bytes, then persists their immutable manifest. */
export class PersonaCreationProtocol {
  constructor(
    private readonly repository: PostgresPersonaCreationRepository,
    private readonly blobs: BlobStore,
  ) {}

  async uploadModeratedPhotos(
    reservation: PersonaCreationReservation,
    photos: Buffer[],
  ): Promise<Pick<PersonaCreationReservation, "id" | "state">> {
    if (photos.length !== reservation.photoKeys.length) {
      throw new Error("Moderated photo count does not match the Persona reservation");
    }
    try {
      for (const [index, photo] of photos.entries()) {
        await this.blobs.put(reservation.photoKeys[index]!, photo);
      }
      return await this.repository.markUploaded(
        reservation.id,
        photos.map((photo, index) => ({
          key: reservation.photoKeys[index]!,
          sha256: createHash("sha256").update(photo).digest("hex"),
          size: photo.byteLength,
        })),
      );
    } catch (error) {
      await Promise.allSettled(reservation.photoKeys.map((key) => this.blobs.delete(key)));
      await this.repository.abort(reservation.id);
      throw error;
    }
  }

  async reconcileExpiredReservations(): Promise<void> {
    const expiredReservations = await this.repository.claimExpiredReservations();
    for (const reservation of expiredReservations) {
      await Promise.all(reservation.photoKeys.map((key) => this.blobs.delete(key)));
      await this.repository.markExpiredCleanupComplete(reservation.id);
    }
  }
}

/**
 * Acknowledges an outbox event only after the serializable workflow event has
 * been submitted. A crash after submit and before acknowledgement replays the
 * identical event ID after its lease expires, so the eventual consumer can
 * deduplicate without losing the committed Persona creation.
 */
export class PersonaCreationOutboxDispatcher {
  constructor(
    private readonly repository: PostgresPersonaCreationRepository,
    private readonly workflow: WorkflowAdapter,
  ) {}

  async dispatchOne(leaseSeconds = 60): Promise<boolean> {
    const event = await this.repository.claimOutbox(leaseSeconds);
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
    await this.repository.markOutboxSent(event.id);
    return true;
  }
}

/**
 * Rehydrates the committed result at delivery time and delegates its side
 * effect through a stable workflow step. LUL-103 supplies the production
 * training callback; repeated provider delivery cannot run that callback
 * twice for one immutable outbox event.
 */
export class PersonaCreationOutboxConsumer {
  constructor(
    private readonly repository: PostgresPersonaCreationRepository,
    private readonly workflow: WorkflowAdapter,
    private readonly onFinalized: (creation: FinalizedPersonaCreation) => Promise<void>,
  ) {}

  async consume(event: PersonaCreationOutboxEvent): Promise<void> {
    const finalized = await this.repository.readFinalized(event.reservationId);
    if (finalized.outboxEventId !== event.id) {
      throw new Error("Persona creation outbox event does not match its finalized reservation");
    }
    await this.workflow.run([
      {
        name: "consume-persona-creation-finalized",
        idempotencyKey: `persona-creation-finalized:${event.id}`,
        run: () => this.onFinalized(finalized),
      },
    ]);
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
