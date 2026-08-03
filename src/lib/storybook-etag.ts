import { createHash } from "node:crypto";

/** A stable, opaque validator for one Family-scoped Storybook projection. */
export function storybookResponseEtag(payload: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("base64url");
  return `"${digest}"`;
}

export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag || value === `W/${etag}`);
}
