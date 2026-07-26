import { createHash } from "node:crypto";
import type { LivenessAdapter } from "@/adapters/types";
import type { ChildSafetyService } from "@/services/child-safety";
import { runPreflightChecks } from "@/services/preflight";
import {
  PersonaCreationProtocol,
  type FinalizedPersonaCreation,
  type PersonaCreationReservationInput,
} from "@/db/persona-creation-protocol";

export interface ProductionPersonaCreationInput extends PersonaCreationReservationInput {
  photos: Buffer[];
  selfie?: Buffer;
}

export const MAX_PERSONA_PHOTOS = 20;

export function assertPersonaPhotoCount(photoCount: number): void {
  if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > MAX_PERSONA_PHOTOS) {
    throw new Error(`Photo count must be between 1 and ${MAX_PERSONA_PHOTOS}`);
  }
}

/** Production use-case: consent/capacity is reserved by PostgreSQL only after bytes pass moderation. */
export class ProductionPersonaCreationService {
  constructor(
    private readonly childSafety: ChildSafetyService,
    private readonly liveness: LivenessAdapter,
    private readonly protocol: PersonaCreationProtocol,
  ) {}

  async create(input: ProductionPersonaCreationInput): Promise<FinalizedPersonaCreation> {
    assertPersonaPhotoCount(input.photoCount);
    assertPersonaPhotoCount(input.photos.length);
    if (input.photos.length !== input.photoCount) {
      throw new Error("Persona photo count does not match the request manifest");
    }
    const preflight = runPreflightChecks(input.photos);
    if (!preflight.passed) {
      throw new Error(`Pre-flight failed: ${preflight.reasons.join(", ")}`);
    }
    if (input.kind === "adult") {
      if (!input.selfie) throw new Error("Selfie required for adult Persona");
      const liveness = await this.liveness.verifySelfie(input.photos, input.selfie);
      if (!liveness.matched) throw new Error("Selfie does not match uploaded photos");
    }
    for (const photo of input.photos) {
      await this.childSafety.checkUpload(photo, `persona-create:${input.requestFingerprint}`);
    }
    return this.protocol.createFromModeratedPhotos(input, input.photos);
  }
}

export function personaCreationRequestFingerprint(
  input: Omit<ProductionPersonaCreationInput, "requestFingerprint">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        displayName: input.displayName,
        photoSha256: input.photos.map((photo) => createHash("sha256").update(photo).digest("hex")),
        baby: input.baby ?? null,
        bond: input.bond ?? null,
        adultConsentReceiptId: input.adultConsentReceiptId ?? null,
      }),
    )
    .digest("hex");
}
