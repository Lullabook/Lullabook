# Part3 follow-up — #197 broad-gate compatibility

- **Ticket:** #197
- **Commit:** `24df1ef`
- **Purpose:** restore branch-wide verification after exact default-R1 enforcement without weakening production behavior.

The video workflow now checks `!isR1OnePlan()` directly, and the legacy voice/short-story/video tests explicitly opt into R2 (`R1_MULTI_FAMILY_ENABLED=true`). Default R1 remains exact 12 pages and video-disabled.

Evidence: affected compatibility subset passed **51/51**; scoped ESLint and `git diff --check` passed. No unrelated paths were staged.
