import type { BlobStore } from "@/adapters/types";

/**
 * 206 — Import and curate the Guardian's photo folder into training sets.
 *
 * Reads the Guardian-supplied "lullabook family testing" folder plus its
 * handover document, validates each person's photo set against the documented
 * quality checklist, and writes a machine-readable report of what is accepted
 * and what is unusable — BEFORE any upload happens. This ticket uploads
 * nothing (`SEC-2`): intake only reports.
 *
 * Folders are read through an injected `FileSystemSource` and faces are
 * detected through an injected `FaceDetector`, so a real run can be driven by
 * the local filesystem + a vision provider while tests fake both.
 */

/** Quality checklist bounds, documented in the handover brief. */
export const MIN_PHOTOS = 10;
export const MAX_PHOTOS = 20;
/** The handover document filename expected inside the folder root. */
export const HANDOVER_FILENAME = "handover.txt";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp"]);

/** Seam: how intake touches the local filesystem (faked in tests). */
export interface FileSystemSource {
  /** Returns the raw text, or null when the file does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Returns the file names (photos) present in a directory. */
  listFileNames(dir: string): Promise<string[]>;
}

/** Seam: how many detectable faces a photo contains (faked in tests). */
export interface FaceDetector {
  countFaces(photoPath: string): Promise<number>;
}

export interface PhotoIntakeOptions {
  fs: FileSystemSource;
  faceDetector: FaceDetector;
  /**
   * Accepted purely so the `SEC-2` "uploads nothing" invariant is
   * machine-checkable. Intake never calls `put`; the test asserts zero writes.
   */
  blobs?: BlobStore;
}

export interface PersonIntake {
  id: string;
  /**
   * `minor` | `adult` from the handover document. `undefined` means the person
   * was never labelled — they are REJECTED, never defaulted. This is the one
   * widening of the contract pin: a rejected-unlabelled person has no valid
   * label to emit, and defaulting would violate the checklist.
   */
  label: "minor" | "adult" | undefined;
  age: number;
  acceptedPhotos: string[];
  rejectedPhotos: { path: string; reason: string }[];
}

export interface IntakeReport {
  persons: PersonIntake[];
}

interface HandoverRow {
  folder: string;
  name: string;
  age: number;
  label?: string;
}

function isImageFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.has(fileName.slice(dot).toLowerCase());
}

function normalizeLabel(raw: string | undefined): "minor" | "adult" | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "minor" || value === "adult") return value;
  return undefined;
}

/**
 * # lullabook family testing — handover document (`handover.txt`)
 *
 * One person per line, `key=value` fields separated by `;`. Blank lines and
 * lines starting with `#` are ignored. The `folder` value names the subfolder
 * that holds that person's photos. `label` is `minor` or `adult`; a person
 * without a valid label is rejected (never defaulted). `age` is a number.
 *
 *   folder=daniel; name=Daniel; age=43; label=adult
 *   folder=maya; name=Maya; age=3; label=minor
 *   folder=noah; name=Noah; age=14; label=minor
 */
export function parseHandover(raw: string): HandoverRow[] {
  const rows: HandoverRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const fields: Record<string, string> = {};
    for (const part of trimmed.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) fields[key] = value;
    }
    if (!fields.folder) continue;
    rows.push({
      folder: fields.folder,
      name: fields.name ?? fields.folder,
      age: fields.age !== undefined && fields.age !== "" ? Number(fields.age) : NaN,
      label: fields.label,
    });
  }
  return rows;
}

export class PhotoIntakeService {
  constructor(private readonly opts: PhotoIntakeOptions) {}

  async run(folderRoot: string): Promise<IntakeReport> {
    const handoverPath = `${folderRoot}/${HANDOVER_FILENAME}`;
    const raw = await this.opts.fs.readFile(handoverPath);
    if (raw === null) {
      throw new Error(
        `PHOTO_INTAKE_REFUSED: handover document was not found at '${handoverPath}'. ` +
          `Create this file inside the 'lullabook family testing' folder before running intake.`,
      );
    }

    const rows = parseHandover(raw);
    const persons: PersonIntake[] = [];
    for (const row of rows) {
      persons.push(await this.validatePerson(folderRoot, row));
    }
    return { persons };
  }

  private async validatePerson(folderRoot: string, row: HandoverRow): Promise<PersonIntake> {
    const id = row.folder;
    const dir = `${folderRoot}/${row.folder}`;

    const label = normalizeLabel(row.label);
    if (!label) {
      return {
        id,
        label: undefined,
        age: row.age,
        acceptedPhotos: [],
        rejectedPhotos: [
          {
            path: `(person:${id})`,
            reason: `no valid minor/adult label; write label=minor or label=adult`,
          },
        ],
      };
    }

    if (!Number.isFinite(row.age)) {
      return {
        id,
        label,
        age: row.age,
        acceptedPhotos: [],
        rejectedPhotos: [{ path: `(person:${id})`, reason: `no valid age recorded` }],
      };
    }

    const photos = (await this.opts.fs.listFileNames(dir)).filter(isImageFile);

    if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) {
      const reason = `expected ${MIN_PHOTOS}-${MAX_PHOTOS} photos, found ${photos.length}`;
      const rejected =
        photos.length > 0
          ? photos.map((path) => ({ path, reason }))
          : [{ path: `(person:${id})`, reason }];
      return { id, label, age: row.age, acceptedPhotos: [], rejectedPhotos: rejected };
    }

    const acceptedPhotos: string[] = [];
    const rejectedPhotos: { path: string; reason: string }[] = [];
    for (const photo of photos) {
      const path = `${dir}/${photo}`;
      const faces = await this.opts.faceDetector.countFaces(path);
      if (faces > 1) {
        rejectedPhotos.push({
          path,
          reason: `contains ${faces} detectable faces; group shots train a poor LoRA`,
        });
      } else {
        acceptedPhotos.push(path);
      }
    }

    return { id, label, age: row.age, acceptedPhotos, rejectedPhotos };
  }
}
