# 57 — Local blob-store dev fallback (unblock add-family-member locally)

Triage: ready-for-agent

## What to build
Adding a family member crashes locally with `Missing required environment variable
BLOB_S3_ACCESS_KEY_ID` because `src/lib/context.ts` always wires `R2BlobStore`, whose
client requires real S3 creds. Mirror the **existing moderation dev-fallback** pattern
(same file: `RealModerationAdapter` vs `PermissiveDevModeration`) for the blob store.

- New **disk-backed dev blob store** implementing the `BlobStore` port
  (`src/adapters/types.ts`): `put`/`get`/`delete`/`list`/`deletePrefix`/`signedUrl`,
  persisting objects under a gitignored local dir (e.g. `.localblob/`, key → file
  path) so uploaded photos and generated avatars survive a dev-server restart through
  the async training flow. (`InMemoryBlobStore` in `src/adapters/fakes.ts` is the
  shape reference; disk-backed is preferred over in-memory for persistence.)
- In `context.ts`, select the store the same way moderation is selected: use
  `R2BlobStore` when `BLOB_S3_ACCESS_KEY_ID` is set **or** `NODE_ENV === production`;
  otherwise the disk-backed dev store. Production behavior is unchanged.
- Add `.localblob/` to `.gitignore`.
- `signedUrl` in the dev store returns a locally-servable URL for the key (e.g. via
  the existing `/api/images` route or a direct file URL) so `<img>` loads in dev.

## Acceptance criteria
- With **no** `BLOB_S3_*` vars set and `NODE_ENV !== production`, adding a family
  member completes without throwing; uploaded photos round-trip through the dev store.
- With `BLOB_S3_ACCESS_KEY_ID` set (or in production), `R2BlobStore` is used exactly as
  before — no behavior change on the production path.
- Stored objects persist across a dev-server restart (disk-backed).
- `.localblob/` is gitignored and never committed.
- New tests cover the dev store's put/get/delete/list/deletePrefix and the
  context selection logic (creds present → R2, absent+non-prod → dev). All existing
  tests stay green.

## Blocked by
(none)
