# 57 — Local blob-store dev fallback (unblock add-family-member locally)
Status: shipped
Added a disk-backed dev `BlobStore` (mirrors the moderation dev-fallback pattern) selected in `context.ts` whenever `BLOB_S3_ACCESS_KEY_ID` is unset and `NODE_ENV !== production`; persists under gitignored `.localblob/`. Production path (`R2BlobStore`) unchanged. Unblocks local dev without real S3 creds.
(condensed 2026-07-07 — full spec in git history)
