# Part3 follow-up — #198 broad-gate compatibility

- **Ticket:** #198
- **Commit:** `fbff222`
- **Purpose:** keep test-only provider compositions explicit under the production fail-closed margin gate.

`createTestContext` now injects deterministic 80% margin evidence through a test-only cost-meter seam for Persona, Storybook, and TextStory fixtures. Production composition still derives persisted evidence and fails closed when it is absent/red. The affected strict-R1/spend subset passed **51/51**; no production bypass was added.
