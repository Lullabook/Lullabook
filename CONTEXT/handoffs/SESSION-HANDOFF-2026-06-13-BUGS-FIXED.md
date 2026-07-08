# Session Handoff — 2026-06-13: Web Shared Service Bugs Fixed

Status: historical

All 8 outstanding shared-service bugs from the 2026-06-12 code review fixed and
pinned by tests on `fix/web-shared-service-bugs` (122 tests, build green, Kaizen
coach 10/10): promotion `PersonaKind` honored, hard-delete clears all child PII
maps, failed-book recovery, safe re-roll candidate selection, failed persona-create
flips status, `pageRecover` terminal handler, moderation fails closed on
non-numeric scores, `getLikenessSamples` tenancy enforced.

- Binding: text moderation rejects non-numeric class scores (fail closed).
- Binding: `hardDeleteFamily` must purge every store map (erasure guarantee, ADR-0007).
- Binding: `/mobile` is excluded from the Next.js `tsconfig.json` — root build never type-checks Expo files.

(condensed 2026-07-07 — full text in git history)
