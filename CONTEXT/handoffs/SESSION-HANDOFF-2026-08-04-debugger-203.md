# Debugger — #203 hardening

- **Ticket:** #203 / local 195
- **Commit:** `b2463d1`
- **Status:** Debugging; deterministic gate remains intentionally BLOCKED for missing live evidence.

Fixed the false-green live-evidence contract. The evaluator now requires explicit approval, a positive hard budget, synthetic/consenting-adult fixture declaration, rotated server-only credentials, production build evidence, distinct Anthropic + fal request IDs, invoice-to-request mapping within budget, two distinct owned LoRA artifacts, and structured RLS/Hard-delete evidence. Arbitrary booleans/strings such as `x`, `y`, duplicate artifacts, or over-budget cost remain BLOCKED.

Evidence:
- `npx vitest run tests/195-reachable-release-gate.test.ts tests/195-native-gate-contract.test.ts` — **7/7 passed**.
- `npm run gate:release` — deterministic **18/18 PASS**, live evidence **BLOCKED** as required, exit 2.
- Root/mobile typecheck, scoped ESLint, and diff checks passed.
