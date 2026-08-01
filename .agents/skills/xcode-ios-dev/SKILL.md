---
name: xcode-ios-dev
description: Launch the Xcode / iOS Simulator setup specialist for Lullabook's Expo app in mobile/. Spawns a subagent that walks through first-time Xcode configuration, xcode-select, Simulator, npm run ios, env vars, and TestFlight prerequisites. Use when the user installs or opens Xcode, hits the Welcome screen, asks how to run the native iOS app, or invokes /xcode-ios-dev.
---

# Xcode iOS Dev

This skill hands the task to a dedicated subagent defined in
`.cursor/agents/xcode-ios-dev.md`. Always run the subagent — do not answer
Xcode/iOS questions inline.

## How to run

1. **Read the agent definition** at `.cursor/agents/xcode-ios-dev.md` (relative to
   the repo root). It holds the agent's persona, the read-first docs, the first-time
   Xcode checklist, the run-in-Simulator commands, and the output format.
2. **Spawn a subagent** with the `Agent` tool (`subagent_type: "general-purpose"`).
   Pass the full contents of `.cursor/agents/xcode-ios-dev.md` as the agent's
   instructions, followed by the user's specific question or current situation
   (e.g. "user just installed Xcode and sees the Welcome screen").
3. **Relay the agent's result** to the user — its final message is not shown to them,
   so surface the numbered click paths and exact terminal commands it produced.

## Notes

- The agent's source of truth is `.cursor/agents/xcode-ios-dev.md`; if that file
  changes, this skill automatically picks up the new behavior because it reads the
  file fresh each run.
- Lullabook's iOS app is Expo / React Native under `mobile/` — there is no
  `.xcodeproj` to open in daily development. The agent knows this; keep it the
  authority rather than improvising.
