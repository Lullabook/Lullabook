# Session Handoff — Debugger #200

- **Ticket:** #200 / local issue 192 — Reduce authenticated read and blob-serving cost
- **Stage:** Debugging → Review Ready
- **Hardening commit:** `23e4022`
- **Builder baseline:** `5563bca`

## Debug result

Luna max hardened the server read/blob lane:

- Minimal hydration profile upgrades/retries are explicit and cookie auth uses minimal hydration.
- Authenticated read paths stay within the two-wave bound without weakening write/full-hydration and hard-delete paths.
- Blob keys are traversal-safe; missing/unauthorized images and avatars return private non-disclosing responses.
- Missing-avatar adapter fallback is safe after restart.
- Family/member ownership remains enforced through the authenticated store path.

## Evidence

```text
npx vitest run tests/192-read-hydration-scope.test.ts tests/192-blob-serving-auth-cache.integration.test.ts tests/178-supabase-rls.integration.test.ts
Test Files 3 passed (3)
Tests 33 passed (33)
```

Scoped ESLint and `git diff --check` passed. The RLS run emitted only non-failing listener warnings. Broad verify remains a shared-tree gate while later tickets #201–#203 are Coding; rerun after that wave settles.

## Scope

Only these paths were staged in `23e4022`:

- `src/db/supabase-store.ts`
- `src/lib/request-auth.ts`
- `src/app/api/images/route.ts`
- `src/app/api/avatars/route.ts`
- `tests/192-read-hydration-scope.test.ts`
- `tests/192-blob-serving-auth-cache.integration.test.ts`

Unrelated dirty paths were preserved and not staged.
