# 01 — Walking skeleton: auth, Family, empty Persona roster

Status: shipped
Foundation: Supabase Auth + Postgres. First login creates a Family with the user as its first Member (Guardian role). Row-level security enforces per-Family isolation — a Member of Family A can never read Family B's rows. Provider adapter interfaces (Anthropic, fal.ai, moderation, liveness) stubbed for later slices. This RLS/Family/Guardian model still underlies every later feature.
(condensed 2026-07-07 — full spec in git history)
