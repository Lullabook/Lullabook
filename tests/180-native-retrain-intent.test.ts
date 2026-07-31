import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mobilePath = join(process.cwd(), "mobile/app/likeness/[id].tsx");

describe("180 — native retrain intent", () => {
  it("uses Expo ImagePicker and uploads at least three replacement photos to the authenticated retrain boundary", () => {
    const source = readFileSync(mobilePath, "utf8");

    expect(source).toMatch(/expo-image-picker/);
    expect(source).toMatch(/requestMediaLibraryPermissionsAsync/);
    expect(source).toMatch(/launchImageLibraryAsync/);
    expect(source).toMatch(/allowsMultipleSelection:\s*true/);
    expect(source).toMatch(/retrainLikeness/);
    expect(source).toMatch(/appendNativeFile\(formData, "photos"/);
    expect(source).toMatch(/selectedPhotos\.length\s*<\s*3/);
  });
});
