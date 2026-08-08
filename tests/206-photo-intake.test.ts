import { describe, expect, it } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import {
  HANDOVER_FILENAME,
  MAX_PHOTOS,
  MIN_PHOTOS,
  PhotoIntakeService,
  parseHandover,
  type FaceDetector,
  type FileSystemSource,
  type IntakeReport,
} from "@/services/photo-intake";

function memFs(files: Record<string, string>, dirs: Record<string, string[]>): FileSystemSource {
  return {
    async readFile(path) {
      return files[path] ?? null;
    },
    async listFileNames(dir) {
      return dirs[dir] ?? [];
    },
  };
}

function fakeFaces(counts?: Record<string, number>): FaceDetector {
  return {
    async countFaces(path) {
      return counts?.[path] ?? 1;
    },
  };
}

function photoSet(dir: string, prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${dir}/${prefix}${i}.jpg`);
}

const ROOT = "/Users/guardian/lullabook family testing";
const HANDOVER_PATH = `${ROOT}/${HANDOVER_FILENAME}`;

function handover(persons: string[]): string {
  return ["# lullabook family testing — handover", ...persons].join("\n");
}

describe("206 — photo intake & curation", () => {
  it("refuses to run when the handover document is missing and names the expected path (AC1)", async () => {
    const svc = new PhotoIntakeService({ fs: memFs({}, {}), faceDetector: fakeFaces() });

    await expect(svc.run(ROOT)).rejects.toThrow(HANDOVER_PATH);
    await expect(svc.run(ROOT)).rejects.toThrow(/PHOTO_INTAKE_REFUSED/);
  });

  it("accepts a person whose photo count is within 10-20 and rejects every photo outside it (AC2)", async () => {
    const daniel = "daniel";
    const maya = "maya";
    const files = { [HANDOVER_PATH]: handover([`folder=${daniel}; name=Daniel; age=43; label=adult`, `folder=${maya}; name=Maya; age=3; label=minor`]) };
    const goodPhotos = photoSet(`${ROOT}/${daniel}`, "p", MIN_PHOTOS);
    const tooMany = photoSet(`${ROOT}/${maya}`, "q", MAX_PHOTOS + 5);
    const dirs = {
      [`${ROOT}/${daniel}`]: goodPhotos.map((p) => p.split("/").pop()!),
      [`${ROOT}/${maya}`]: tooMany.map((p) => p.split("/").pop()!),
    };
    const svc = new PhotoIntakeService({ fs: memFs(files, dirs), faceDetector: fakeFaces() });

    const report = await svc.run(ROOT);

    const dad = report.persons.find((p) => p.id === daniel)!;
    expect(dad.acceptedPhotos).toHaveLength(MIN_PHOTOS);
    expect(dad.rejectedPhotos).toHaveLength(0);
    expect(dad.label).toBe("adult");

    const daughter = report.persons.find((p) => p.id === maya)!;
    expect(daughter.acceptedPhotos).toHaveLength(0);
    expect(daughter.rejectedPhotos).toHaveLength(MAX_PHOTOS + 5);
    expect(daughter.rejectedPhotos[0].reason).toMatch(/expected 10-20 photos/i);
    expect(daughter.rejectedPhotos[0].reason).toContain(String(MAX_PHOTOS + 5));
  });

  it("reports a person with too few photos as unusable with the count reason (AC2)", async () => {
    const liam = "liam";
    const files = { [HANDOVER_PATH]: handover([`folder=${liam}; name=Liam; age=1; label=minor`]) };
    const tooFew = photoSet(`${ROOT}/${liam}`, "p", MIN_PHOTOS - 3);
    const dirs = { [`${ROOT}/${liam}`]: tooFew.map((p) => p.split("/").pop()!) };
    const svc = new PhotoIntakeService({ fs: memFs(files, dirs), faceDetector: fakeFaces() });

    const report = await svc.run(ROOT);
    const l = report.persons.find((p) => p.id === liam)!;
    expect(l.acceptedPhotos).toHaveLength(0);
    expect(l.rejectedPhotos[0].reason).toMatch(/expected 10-20 photos/i);
    expect(l.rejectedPhotos[0].reason).toContain(String(MIN_PHOTOS - 3));
  });

  it("rejects a photo containing more than one detectable face as unusable (AC3)", async () => {
    const daniel = "daniel";
    const files = { [HANDOVER_PATH]: handover([`folder=${daniel}; name=Daniel; age=43; label=adult`]) };
    const shots = photoSet(`${ROOT}/${daniel}`, "p", MIN_PHOTOS);
    const groupPath = `${ROOT}/${daniel}/p5.jpg`;
    const faceCounts: Record<string, number> = {};
    for (const p of shots) faceCounts[p] = 1;
    faceCounts[groupPath] = 3;
    const dirs = { [`${ROOT}/${daniel}`]: shots.map((p) => p.split("/").pop()!) };
    const svc = new PhotoIntakeService({ fs: memFs(files, dirs), faceDetector: fakeFaces(faceCounts) });

    const report = await svc.run(ROOT);
    const dad = report.persons.find((p) => p.id === daniel)!;
    expect(dad.rejectedPhotos).toHaveLength(1);
    expect(dad.rejectedPhotos[0].path).toBe(groupPath);
    expect(dad.rejectedPhotos[0].reason).toMatch(/more than one.*face|group shot/i);
    expect(dad.acceptedPhotos).toHaveLength(MIN_PHOTOS - 1);
  });

  it("labels every person minor/adult and rejects an unlabelled person rather than defaulting (AC4)", async () => {
    const alex = "alex";
    const files = {
      [HANDOVER_PATH]: handover([`folder=${alex}; name=Alex; age=27`]),
    };
    const dirs = { [`${ROOT}/${alex}`]: photoSet(`${ROOT}/${alex}`, "p", MIN_PHOTOS).map((p) => p.split("/").pop()!) };
    const svc = new PhotoIntakeService({ fs: memFs(files, dirs), faceDetector: fakeFaces() });

    const report = await svc.run(ROOT);
    const a = report.persons.find((p) => p.id === alex)!;
    expect(a.label).toBeUndefined();
    expect(a.acceptedPhotos).toHaveLength(0);
    expect(a.rejectedPhotos[0].reason).toMatch(/minor\/adult label/i);
  });

  it("a labelled person is reported with minor or adult and passes on the checklist (AC4)", async () => {
    const files = {
      [HANDOVER_PATH]: handover([
        `folder=dad; name=Dad; age=50; label=adult`,
        `folder=maya; name=Maya; age=3; label=minor`,
      ]),
    };
    const dirs = {
      [`${ROOT}/dad`]: photoSet(`${ROOT}/dad`, "p", 12).map((p) => p.split("/").pop()!),
      [`${ROOT}/maya`]: photoSet(`${ROOT}/maya`, "p", 11).map((p) => p.split("/").pop()!),
    };
    const svc = new PhotoIntakeService({ fs: memFs(files, dirs), faceDetector: fakeFaces() });

    const report: IntakeReport = await svc.run(ROOT);
    expect(report.persons.find((p) => p.id === "dad")!.label).toBe("adult");
    expect(report.persons.find((p) => p.id === "maya")!.label).toBe("minor");
  });

  it("writes a schema-conforming report and uploads nothing (AC5, SEC-2)", async () => {
    const daniel = "daniel";
    const maya = "maya";
    const files = {
      [HANDOVER_PATH]: handover([
        `folder=${daniel}; name=Daniel; age=43; label=adult`,
        `folder=${maya}; name=Maya; age=3; label=minor`,
      ]),
    };
    const dadPhotos = photoSet(`${ROOT}/${daniel}`, "p", 14);
    const mayaPhotos = photoSet(`${ROOT}/${maya}`, "p", 12);
    const dirs = {
      [`${ROOT}/${daniel}`]: dadPhotos.map((p) => p.split("/").pop()!),
      [`${ROOT}/${maya}`]: mayaPhotos.map((p) => p.split("/").pop()!),
    };
    const blobs = new InMemoryBlobStore();
    const svc = new PhotoIntakeService({ fs: memFs(files, dirs), faceDetector: fakeFaces(), blobs });

    const report = await svc.run(ROOT);

    for (const person of report.persons) {
      expect(["minor", "adult"]).toContain(person.label);
      expect(typeof person.age).toBe("number");
      for (const p of person.acceptedPhotos) expect(typeof p).toBe("string");
      for (const r of person.rejectedPhotos) {
        expect(typeof r.path).toBe("string");
        expect(typeof r.reason).toBe("string");
      }
    }
    expect(report.persons.map((p) => p.id).sort()).toEqual([daniel, maya].sort());
    expect(report.persons.find((p) => p.id === daniel)!.acceptedPhotos).toHaveLength(14);
    expect(report.persons.find((p) => p.id === maya)!.acceptedPhotos).toHaveLength(12);
    expect(blobs.size()).toBe(0);
  });

  it("parseHandover ignores comments, blank lines and malformed rows", () => {
    const rows = parseHandover(
      "# comment\n\nfolder=a; name=A; age=40; label=adult\n  \nnot a valid row\nfolder=b; name=B; age=1; label=minor\n",
    );
    expect(rows.map((r) => r.folder)).toEqual(["a", "b"]);
  });
});
