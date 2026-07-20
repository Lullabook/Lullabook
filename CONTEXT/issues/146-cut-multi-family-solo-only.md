# 146 — Cut multi-family: solo Guardian, one baby, solo plan only

Status: partially superseded by PRD v21 / ADR-0028

Collapsed R1 to a solo creating Guardian: family-invite/invited-member/voice-message endpoints
stay disabled server-side (404/403, never 500), create-rights remain Guardian-only, and the
collaborative plan stays hidden. PRD v21 / ADR-0028 supersede only the one-Baby restriction:
one Guardian may now own multiple Family people and Babies up to the shared three-Persona plan
cap. Multi-Member/two-plan code remains behind config for a later release.

(condensed 2026-07-07 — full spec in git history)
