import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 163 — Fix mobile photo-training upload ("Unsupported FormDataPart implementation").
 *
 * Expo SDK 56 / RN 0.85 introduced a new "winter" fetch polyfill
 * (`expo/src/winter/fetch/convertFormData.ts`) that throws
 * "Unsupported FormDataPart implementation" on RN's native `{uri, name, type}`
 * FormData file parts — it only handles strings, Blobs, and objects with a
 * `bytes()` method. The RN-native XMLHttpRequest streams `{uri}` parts from
 * disk natively (no base64 in memory), which is I1.3's "≤10 images, streamed"
 * invariant.
 *
 * The fix: `apiFormData` uses `XMLHttpRequest` directly (the RN-blessed
 * streaming path) for multipart uploads, bypassing the winter fetch polyfill.
 * The existing `appendNativeFile`/`setNativeFile` helpers are unchanged — they
 * already build the correct RN `{uri, name, type}` part shape (proven by
 * tests/88-mobile-form-data.test.ts).
 *
 * This test is source-level (like 156/166) because `mobile/lib/api.ts` imports
 * mobile-only modules (`@/lib/env`, `@domain/types`) that don't resolve in the
 * root vitest/tsc context. The behavior is verified by inspecting the source.
 */

const ROOT = process.cwd();
const mobile = (p: string) => join(ROOT, "mobile", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("163 — mobile FormData upload (XMLHttpRequest streaming path)", () => {
  const apiSrc = read(mobile("lib/api.ts"));

  describe("apiFormData uses XMLHttpRequest (not fetch)", () => {
    it("creates a new XMLHttpRequest in apiFormData", () => {
      // The fix: XHR streams {uri} parts from disk natively, bypassing the
      // winter fetch polyfill that throws "Unsupported FormDataPart implementation".
      expect(apiSrc).toMatch(/new XMLHttpRequest\(\)/);
    });

    it("does NOT use fetch() in apiFormData (the broken winter polyfill path)", () => {
      // Extract the apiFormData function body and verify no fetch() call.
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      expect(fnBody).not.toMatch(/\bfetch\(/);
    });

    it("sends the FormData body as-is (not converted to a different shape)", () => {
      // The XHR .send(body) passes the FormData directly — RN XHR serializes
      // it natively, streaming {uri} from disk (I1.3: no base64 in memory).
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      expect(fnBody).toMatch(/xhr\.send\(body\)/);
    });

    it("attaches the bearer token via setRequestHeader", () => {
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      expect(fnBody).toMatch(/setRequestHeader.*Authorization.*Bearer/);
    });
  });

  describe("I2.3 — failure handling (no partial Persona, retryable error)", () => {
    it("surfaces a non-2xx status as an Error with the server's error message", () => {
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      // On 4xx/5xx, the error from the response body is thrown — no partial
      // Persona persisted, training not left half-started.
      expect(fnBody).toMatch(/status.*200|status.*< 300/);
      expect(fnBody).toMatch(/reject/);
    });

    it("surfaces a network error (onerror) as a retryable Error", () => {
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      expect(fnBody).toMatch(/xhr\.onerror/);
      expect(fnBody).toMatch(/reject/);
    });

    it("onreadystatechange defers to onerror when status === 0 (network failure)", () => {
      // Red-team EDGE-1: XHR spec fires onreadystatechange(readyState=4, status=0)
      // BEFORE onerror. If onreadystatechange rejects with "Upload failed (0)",
      // the helpful onerror message is swallowed by the `settled` guard. The
      // fix: when status === 0, return early from onreadystatechange and let
      // onerror/ontimeout handle it.
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      // status === 0 means the request never reached the server — don't
      // reject with a generic error; let onerror surface the network message.
      expect(fnBody).toMatch(/status\s*===\s*0/);
    });

    it("surfaces a timeout as a retryable Error", () => {
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      expect(fnBody).toMatch(/xhr\.ontimeout/);
      expect(fnBody).toMatch(/reject/);
    });

    it("sets a timeout on the XHR (no infinite hang)", () => {
      const fnStart = apiSrc.indexOf("export async function apiFormData");
      const fnEnd = apiSrc.indexOf("\n}", fnStart);
      const fnBody = apiSrc.substring(fnStart, fnEnd);
      expect(fnBody).toMatch(/xhr\.timeout\s*=/);
    });
  });

  describe("I1.3 — ≤10 images, streamed (no full-image base64 in memory)", () => {
    it("the form-data helpers build RN {uri,name,type} parts (not base64)", () => {
      const formDataSrc = read(mobile("lib/form-data.ts"));
      // The helpers append {uri, name, type} objects — RN XHR streams these
      // from disk natively. No base64 conversion anywhere.
      expect(formDataSrc).toMatch(/uri:\s*file\.uri/);
      expect(formDataSrc).toMatch(/name:\s*file\.name/);
      expect(formDataSrc).toMatch(/type:\s*file\.type/);
      expect(formDataSrc).not.toMatch(/base64|readAsDataURL|FileReader/);
    });
  });
});
