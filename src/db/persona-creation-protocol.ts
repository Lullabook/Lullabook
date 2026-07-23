import { createHash } from "node:crypto";
import type { BlobStore } from "@/adapters/types";

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
  state: "finalized";
  outboxEventId: string;
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
    return {
      id: finalized.id,
      state: finalized.state,
      outboxEventId: finalized.outbox_event_id,
    };
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
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
