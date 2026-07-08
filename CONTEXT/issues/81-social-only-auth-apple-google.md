# 81 — Social-only auth: Login with Apple + Login with Google

Status: shipped

Binding decision: email/password removed from mobile UI entirely; only "Continue with
Apple" (`expo-apple-authentication` → Supabase `signInWithIdToken`, provider `apple`)
and "Continue with Google" (`expo-auth-session`/`signInWithIdToken`, provider `google`).
Apple is mandatory whenever Google is offered (App Store Guideline 4.8). First sign-in
creates a Member exactly as before (no domain-model change); `auth/callback` mints the
session the Bearer API expects. Closed as code-complete (GH #24).

(condensed 2026-07-07 — full spec in git history)
