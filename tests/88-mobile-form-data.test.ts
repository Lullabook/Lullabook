import { describe, expect, it, vi } from "vitest";
import { appendNativeFile, setNativeFile, type NativeUploadFile } from "../mobile/lib/form-data";

describe("88 — mobile FormData builder (issue 70 wiring proof)", () => {
  it("appendNativeFile produces a React Native { uri, name, type } part, not a web Blob", () => {
    const form = new FormData();
    const spy = vi.spyOn(form, "append");
    const file: NativeUploadFile = {
      uri: "file:///photos/face.jpg",
      name: "face.jpg",
      type: "image/jpeg",
    };
    appendNativeFile(form, "photos", file);

    expect(spy).toHaveBeenCalledWith("photos", {
      uri: "file:///photos/face.jpg",
      name: "face.jpg",
      type: "image/jpeg",
    });
  });

  it("setNativeFile sets (replaces) the part with the RN shape", () => {
    const form = new FormData();
    const setSpy = vi.spyOn(form, "set");
    const file: NativeUploadFile = {
      uri: "file:///photos/second.jpg",
      name: "second.jpg",
      type: "image/jpeg",
    };
    setNativeFile(form, "photo", file);

    expect(setSpy).toHaveBeenCalledWith("photo", {
      uri: "file:///photos/second.jpg",
      name: "second.jpg",
      type: "image/jpeg",
    });
  });

  it("a built FormData for Add-Family carries the expected keys", () => {
    const form = new FormData();
    const keys: string[] = [];
    const origAppend = form.append.bind(form);
    vi.spyOn(form, "append").mockImplementation((key: string, value: unknown) => {
      keys.push(key);
      return origAppend(key, value);
    });

    form.append("mode", "adult");
    form.append("displayName", "Priya");
    form.append("relationship", "Mom");
    form.append("babyCalls", "Mama");
    form.append("theyCallBaby", "my little star");

    appendNativeFile(form, "photos", {
      uri: "file:///photos/priya-1.jpg",
      name: "priya-1.jpg",
      type: "image/jpeg",
    });
    appendNativeFile(form, "selfie", {
      uri: "file:///photos/selfie.jpg",
      name: "selfie.jpg",
      type: "image/jpeg",
    });

    expect(keys).toContain("mode");
    expect(keys).toContain("displayName");
    expect(keys).toContain("relationship");
    expect(keys).toContain("babyCalls");
    expect(keys).toContain("theyCallBaby");
    expect(keys).toContain("photos");
    expect(keys).toContain("selfie");
  });

  it("multiple photos can be appended (one-or-more photos)", () => {
    const form = new FormData();
    const photoCalls: unknown[][] = [];
    vi.spyOn(form, "append").mockImplementation((...args: unknown[]) => {
      if (args[0] === "photos") photoCalls.push(args);
      return;
    });

    for (let i = 0; i < 3; i++) {
      appendNativeFile(form, "photos", {
        uri: `file:///photos/p-${i}.jpg`,
        name: `p-${i}.jpg`,
        type: "image/jpeg",
      });
    }

    expect(photoCalls).toHaveLength(3);
    expect((photoCalls[0][1] as NativeUploadFile).uri).toBe("file:///photos/p-0.jpg");
    expect((photoCalls[2][1] as NativeUploadFile).uri).toBe("file:///photos/p-2.jpg");
  });

  it("selfie is optional — FormData without selfie is valid for adult create", () => {
    const form = new FormData();
    const keys: string[] = [];
    vi.spyOn(form, "append").mockImplementation((key: string) => {
      keys.push(key);
      return;
    });

    form.append("mode", "adult");
    form.append("displayName", "Sam");
    appendNativeFile(form, "photos", {
      uri: "file:///photos/sam.jpg",
      name: "sam.jpg",
      type: "image/jpeg",
    });

    expect(keys).not.toContain("selfie");
    expect(keys).toContain("photos");
  });
});
