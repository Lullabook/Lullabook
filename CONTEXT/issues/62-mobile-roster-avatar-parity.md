# 62 — Mobile roster-avatar parity (ADR-0020 on native family screens)
Status: cut
Ported ADR-0020 to native (Expo): family screens render the Roster avatar (or gradient+initial placeholder) resolved from `avatarKey` via the same backend as web; add/update-photos flow never displays stored photos. Built and HITL-verified (issue 84), but swept into the PRD v14 R2-defer "roster avatars" bucket (issue 149) — gated off for R1, kept behind config.
(condensed 2026-07-07 — full spec in git history)
