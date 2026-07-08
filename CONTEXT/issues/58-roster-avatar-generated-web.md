# 58 — Roster avatar: generate from LoRA, render everywhere, never the raw photo (web)
Status: cut
Implemented ADR-0020 on web: generate a Roster avatar from each member's likeness LoRA (`avatarKey` on the persona record), rendered everywhere a member picture appears, with a placeholder (gradient + initial) while training/null; raw photo never displayed; avatar erased on hard-delete/purge. Built and HITL-verified (issue 84), but "roster avatars" was later named in the PRD v14 R2-defer list (issue 149) and gated off for R1; the web surface itself is also moot under the mobile-only pivot. The never-raw-photo invariant (ADR-0020) still binds wherever a member picture renders, via the placeholder.
(condensed 2026-07-07 — full spec in git history)
