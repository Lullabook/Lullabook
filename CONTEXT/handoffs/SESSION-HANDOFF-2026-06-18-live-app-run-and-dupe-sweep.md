# Session Handoff — 2026-06-18: live app run + repo-wide macOS dupe sweep

Status: historical

Ran the mobile app on the Simulator per the issue-82 runbook; diagnosed and fixed a total
expo-router "Unmatched Route" failure caused by macOS `Name 2.ext` duplicate files in
`mobile/app/`; swept 128 dupes repo-wide (PR #38) and added a `.gitignore` guard. PRs
#28/#35/#36/#37/#38 merged; app verified working post-sweep.

- Binding: macOS " 2." dupe files break the entire expo-router tree — keep the `.gitignore` guard; if every screen shows "Unmatched Route", sweep dupes first (memory: `lullabook-macos-dupe-files-break-expo-router`).
- `npm run check:runbook` must pass on `main`.

(condensed 2026-07-07 — full text in git history)
