# 80 — Wire remaining stubbed mobile handlers

Status: shipped

Closed the parity backbone: `characters/[id].tsx` fetches the real Character and saves
edits (removed fetch stub); `family/new.tsx` submit creates a real roster
member/persona via the create endpoints with training/`ready` lifecycle copy;
`account.tsx` replaced `Alert.alert` placeholder with real account read + hard-delete
(`hardDeleteAccount()`) behind a confirmation gate. No remaining TODO/`Alert.alert` stub
handlers. Closed as code-complete (GH #23).

(condensed 2026-07-07 — full spec in git history)
