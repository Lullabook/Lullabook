# Session Handoff — 2026-06-15: mobile 500 fix, env wiring, Maya's World design pass

Status: historical

Operational session: fixed the web "request fails 500" (stale `.next` build cache — delete
`.next*` dirs and restart), wired mobile Supabase env (`mobile/lib/env.ts`, lazy Proxy
client, `mobile/app.config.ts` mapping `NEXT_PUBLIC_SUPABASE_*` → `EXPO_PUBLIC_*`), and
migrated mobile tabs, home, and sign-in/sign-up screens to the Maya's World kit.

- Binding: mobile env comes from `mobile/.env` falling back to repo-root `.env.local`, exposed via `app.config.ts` `extra`.
- Binding: mobile design tokens mirror web — `mobile/constants/theme.ts` ↔ `src/components/v2/tokens.ts`; splash bg `#FBF4E7`.

(condensed 2026-07-07 — full text in git history)
