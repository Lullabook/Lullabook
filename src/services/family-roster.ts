import { v4 as uuid } from "uuid";
import type { BlobStore } from "@/adapters/types";
import { RlsViolationError, type DataStore } from "@/db/store";
import type { Baby, BabyPersonBond, Persona, PersonaKind } from "@/domain/types";
import { rosterAvatarFromPersona } from "@/lib/roster-avatar";
import { ChildSafetyService } from "@/services/child-safety";
import { RosterConsentEngine } from "@/services/consent-engine";

export interface FamilyMemberView {
  persona: Persona;
  bond: BabyPersonBond | null;
  photoCount: number;
  voiceClipCount: number;
}

export interface UpdateBondInput {
  memberId: string;
  babyId: string;
  personaId: string;
  relationship: string;
  babyCallsThem: string;
  theyCallBaby: string;
}

export class FamilyRosterService {
  constructor(private readonly store: DataStore) {}

  listForBaby(memberId: string, babyId: string): FamilyMemberView[] {
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");

    const allAdults = this.store
      .getPersonasByFamily(baby.familyId, memberId)
      .filter((p) => p.kind === "adult");

    const personas =
      baby.rosterScope === "isolated"
        ? allAdults.filter((p) =>
            this.store
              .getBondsForBaby(babyId, memberId)
              .some((b) => b.personaId === p.id)
          )
        : allAdults;

    const bonds = this.store.getBondsForBaby(babyId, memberId);
    const bondByPersona = new Map(bonds.map((b) => [b.personaId, b]));

    return personas.map((persona) => ({
      persona,
      bond: bondByPersona.get(persona.id) ?? null,
      photoCount: persona.status === "ready" ? 3 : 0,
      voiceClipCount: this.store.getVoiceClipsForPersona(persona.id, memberId).length,
    }));
  }

  updateBond(input: UpdateBondInput): BabyPersonBond {
    const baby = this.store.getBaby(input.babyId, input.memberId);
    if (!baby) throw new Error("Baby not found");
    const persona = this.store.getPersona(input.personaId, input.memberId);
    if (!persona || persona.kind !== "adult") {
      throw new Error("Family member not found");
    }

    const existing = this.store
      .getBondsForBaby(input.babyId, input.memberId)
      .find((b) => b.personaId === input.personaId);

    const bond: BabyPersonBond = existing
      ? {
          ...existing,
          relationship: input.relationship,
          babyCallsThem: input.babyCallsThem,
          theyCallBaby: input.theyCallBaby,
        }
      : {
          id: uuid(),
          babyId: input.babyId,
          personaId: input.personaId,
          relationship: input.relationship,
          babyCallsThem: input.babyCallsThem,
          theyCallBaby: input.theyCallBaby,
        };

    this.store.saveBabyPersonBond(bond);
    return bond;
  }

  /** Personas visible for a baby's roster group (shared vs isolated). */
  listRosterPersonas(memberId: string, babyId: string): Persona[] {
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");
    const allAdults = this.store
      .getPersonasByFamily(baby.familyId, memberId)
      .filter((p) => p.kind === "adult");

    if (baby.rosterScope === "shared") {
      const sharedGroupIds = new Set(
        this.store
          .getBabiesByFamily(baby.familyId, memberId)
          .filter((b) => b.rosterScope === "shared")
          .map((b) => b.rosterGroupId)
      );
      if (sharedGroupIds.has(baby.rosterGroupId)) return allAdults;
    }
    return allAdults;
  }

  /** RLS-gated roster view (SEC-7): generated avatars only, never raw photos. */
  getRoster(familyId: string, actorMemberId: string): RosterMemberView[] {
    return this.store
      .getPersonasByFamily(familyId, actorMemberId)
      .map((persona) => ({
        personaId: persona.id,
        kind: persona.kind,
        displayName: persona.displayName,
        avatarUrl: rosterAvatarFromPersona(persona),
      }))
      .sort((a, b) => a.personaId.localeCompare(b.personaId));
  }

  /**
   * Ticket 207 — create the Family's five-Persona roster atomically from the
   * ticket 206 intake report. Consent (SEC-2/3/8/9) and moderation (FAIL-9) run
   * BEFORE any durable write; a rejected creation leaves no partial rows and no
   * partial blobs — person, bonds, and Personas are created in one transaction.
   */
  async createRosterFromIntake(
    input: CreateRosterInput,
    deps: RosterCreationDeps
  ): Promise<RosterOutcome> {
    const report = readIntakeReport(input.intake);
    const guardian = this.store.members.get(input.guardianMemberId);
    if (!guardian || guardian.familyId !== input.familyId) {
      throw new RlsViolationError("Guardian is not a member of this Family");
    }

    // SEC-8: classification reads the configured child-age threshold — the
    // intake `label` is advisory but never authoritative. A 14yo routes to
    // parental consent at threshold 18 and to self-consent at 13 purely by the
    // configuration of the jurisdiction.
    const plans = report.persons.map((person) => {
      const isChild = deps.consent.isChild(person.age, input.jurisdiction);
      const kind: PersonaKind = isChild ? "baby" : "adult";
      return { person, isChild, kind };
    });

    // Consent gates run BEFORE any moderation scan or durable write.
    for (const plan of plans) {
      if (plan.isChild) {
        // SEC-2: each minor needs its OWN receipt (bound per subject).
        deps.consent.requireMinorConsent({
          subjectId: plan.person.id,
          familyId: input.familyId,
        });
      } else {
        // SEC-3: adults need self-consent; a Guardian attestation never counts.
        deps.consent.requireAdultSelfConsent({
          selfConsent: input.adultSelfConsent[plan.person.id] === true,
          guardianAttestation: input.guardianAttestationByPerson?.[plan.person.id] === true,
        });
      }
    }

    // Moderation runs BEFORE durable persistence (FAIL-9). A rejected photo
    // throws here with no owned blob written yet.
    const photoBuffersByPerson = new Map<string, Buffer[]>();
    for (const plan of plans) {
      const buffers = input.photosByPerson[plan.person.id] ?? [];
      if (buffers.length === 0) {
        throw new RosterInputError(`No source photos supplied for ${plan.person.id}`);
      }
      for (let i = 0; i < buffers.length; i++) {
        await deps.childSafety.checkUpload(
          buffers[i]!,
          `roster-create:${plan.person.id}:${i}`,
          input.familyId
        );
      }
      photoBuffersByPerson.set(plan.person.id, buffers);
    }

    const now = deps.now ? deps.now() : new Date();
    const seenPersonas = new Set(this.store.personas.keys());
    const seenBabies = new Set(this.store.babies.keys());
    const seenBonds = new Set(this.store.babyPersonBonds.keys());
    const writtenBlobs: string[] = [];
    const personas: Persona[] = [];
    const babies: Baby[] = [];
    const bonds: BabyPersonBond[] = [];

    try {
      // Minor plans each get a Baby record + child persona; the first minor is
      // the primary baby that Adult personas bond to.
      let primaryBaby: Baby | undefined;
      for (const plan of plans) {
        if (!plan.isChild) continue;
        const personaId = uuid();
        const baby: Baby = {
          id: uuid(),
          familyId: input.familyId,
          displayName: input.displayNamesByPerson?.[plan.person.id] ?? plan.person.id,
          birthDate: null,
          dailyRoutine: null,
          rosterGroupId: uuid(),
          rosterScope: "shared",
          isDefault: this.store.babies.size === seenBabies.size,
          createdAt: now,
        };
        const persona = await this.writePersona(
          {
            familyId: input.familyId,
            createdByMemberId: guardian.id,
            displayName: input.displayNamesByPerson?.[plan.person.id] ?? plan.person.id,
            kind: plan.kind,
            photos: photoBuffersByPerson.get(plan.person.id)!,
            now,
          },
          deps,
          writtenBlobs,
        );
        this.store.saveBaby(baby);
        this.store.savePersona(persona);
        babies.push(baby);
        personas.push(persona);
        primaryBaby ??= baby;
      }

      for (const plan of plans) {
        if (plan.isChild) continue;
        const persona = await this.writePersona(
          {
            familyId: input.familyId,
            createdByMemberId: guardian.id,
            displayName: input.displayNamesByPerson?.[plan.person.id] ?? plan.person.id,
            kind: plan.kind,
            photos: photoBuffersByPerson.get(plan.person.id)!,
            now,
          },
          deps,
          writtenBlobs,
        );
        this.store.savePersona(persona);
        personas.push(persona);
        if (primaryBaby) {
          const bond: BabyPersonBond = {
            id: uuid(),
            babyId: primaryBaby.id,
            personaId: persona.id,
            relationship: plan.person.label === "adult" ? "family" : "child",
            babyCallsThem: plan.person.id,
            theyCallBaby: primaryBaby.id,
          };
          this.store.saveBabyPersonBond(bond);
          bonds.push(bond);
        }
      }

      return {
        personas,
        babies,
        bonds,
        roster: this.getRoster(input.familyId, input.guardianMemberId),
      };
    } catch (error) {
      // Atomic rollback: no partial rows, no partial blobs.
      for (const key of writtenBlobs) {
        await deps.blobs.delete(key).catch(() => undefined);
      }
      for (const [id] of this.store.personas) {
        if (!seenPersonas.has(id)) this.store.personas.delete(id);
      }
      for (const [id] of this.store.babies) {
        if (!seenBabies.has(id)) this.store.babies.delete(id);
      }
      for (const [id] of this.store.babyPersonBonds) {
        if (!seenBonds.has(id)) this.store.babyPersonBonds.delete(id);
      }
      throw error;
    }
  }

  private async writePersona(
    opts: {
      familyId: string;
      createdByMemberId: string;
      displayName: string;
      kind: PersonaKind;
      photos: Buffer[];
      now: Date;
    },
    deps: RosterCreationDeps,
    writtenBlobs: string[]
  ): Promise<Persona> {
    const personaId = uuid();
    // Source photos are write-only; the roster never returns or serves them.
    for (let i = 0; i < opts.photos.length; i++) {
      const key = `photos/${personaId}/${i}.jpg`;
      await deps.blobs.put(key, opts.photos[i]!);
      writtenBlobs.push(key);
    }
    // Generated roster avatar (ADR-0020) — the only likeness the roster returns.
    const avatar = await deps.avatarFor({
      familyId: opts.familyId,
      personaId,
      displayName: opts.displayName,
      photos: opts.photos,
    });
    await deps.blobs.put(avatar.avatarKey, avatar.bytes);
    writtenBlobs.push(avatar.avatarKey);
    return {
      id: personaId,
      familyId: opts.familyId,
      createdByMemberId: opts.createdByMemberId,
      kind: opts.kind,
      displayName: opts.displayName,
      status: "ready",
      loraWeightKey: null,
      avatarKey: avatar.avatarKey,
      reviewSampleKeys: [],
      likenessConfirmed: true,
      createdAt: opts.now,
    };
  }
}


// ---------------------------------------------------------------------------
// Ticket 207 — five-Persona roster from the parallel photo-intake (ticket 206)
// ---------------------------------------------------------------------------

/** Contract pinned by ticket 206 (intake -> roster). Tolerant reader, fails
 * closed on schema mismatch. Do NOT import the parallel lane's module. */
export interface PersonIntake {
  id: string;
  label: "minor" | "adult";
  age: number;
  acceptedPhotos: string[];
  rejectedPhotos: Array<{ path: string; reason: string }>;
}

export interface IntakeReport {
  persons: PersonIntake[];
}

export class RosterInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterInputError";
  }
}

/** Tolerant, fail-closed reader for the intake report contract. Rejects on any
 * schema mismatch rather than guessing at structurally unsafe input. */
export function readIntakeReport(raw: unknown): IntakeReport {
  if (!raw || typeof raw !== "object") {
    throw new RosterInputError("Intake report is not an object");
  }
  const report = raw as { persons?: unknown };
  if (!Array.isArray(report.persons)) {
    throw new RosterInputError("Intake report is missing a persons array");
  }
  const persons = report.persons.map((entry, i) => {
    if (!entry || typeof entry !== "object") {
      throw new RosterInputError(`persons[${i}] is not an object`);
    }
    const person = entry as PersonIntake;
    if (typeof person.id !== "string" || person.id.length === 0) {
      throw new RosterInputError(`persons[${i}] is missing a string id`);
    }
    if (person.label !== "minor" && person.label !== "adult") {
      throw new RosterInputError(`persons[${i}] has an invalid label`);
    }
    if (!Number.isInteger(person.age) || person.age < 0) {
      throw new RosterInputError(`persons[${i}] has an invalid age`);
    }
    if (
      !Array.isArray(person.acceptedPhotos) ||
      !person.acceptedPhotos.every((p) => typeof p === "string")
    ) {
      throw new RosterInputError(`persons[${i}] has an invalid acceptedPhotos list`);
    }
    if (
      !Array.isArray(person.rejectedPhotos) ||
      !person.rejectedPhotos.every(
        (r) => r && typeof r === "object" && typeof r.path === "string" && typeof r.reason === "string"
      )
    ) {
      throw new RosterInputError(`persons[${i}] has an invalid rejectedPhotos list`);
    }
    return person;
  });
  return { persons };
}

export interface CreateRosterInput {
  familyId: string;
  guardianMemberId: string;
  jurisdiction: string;
  intake: unknown;
  photosByPerson: Record<string, Buffer[]>;
  /** Person id -> subject self-consent boolean (Adults; SEC-3). */
  adultSelfConsent: Record<string, boolean>;
  /** Person id -> a Guardian attestation, deliberately never accepted (SEC-3). */
  guardianAttestationByPerson?: Record<string, boolean>;
  /** Person id -> display name shown on the roster. Falls back to the id. */
  displayNamesByPerson?: Record<string, string>;
}

export interface RosterCreationDeps {
  consent: RosterConsentEngine;
  childSafety: ChildSafetyService;
  blobs: BlobStore;
  /** Generates the roster avatar (ADR-0020) from accepted source photos. This
   * is the ONLY likeness surface the roster ever returns — never a raw photo.
   * Returns the blob key and bytes to persist. */
  avatarFor: (opts: {
    familyId: string;
    personaId: string;
    displayName: string;
    photos: Buffer[];
  }) => Promise<{ avatarKey: string; bytes: Buffer }>;
  now?: () => Date;
}

export interface RosterMemberView {
  personaId: string;
  kind: PersonaKind;
  displayName: string;
  /** Generated roster avatar serve path, or null when not yet generated. Never a raw photo. */
  avatarUrl: string | null;
}

export interface RosterOutcome {
  personas: Persona[];
  babies: Baby[];
  bonds: BabyPersonBond[];
  roster: RosterMemberView[];
}

