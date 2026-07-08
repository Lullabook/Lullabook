# 162 — Story generation → viewable placeholder-art draft (never failed-with-zero-pages)

Status: shipped

Fixed the core R1 promise: a Brief always produces a viewable book. Persona-free/Character-only
Briefs no longer require a ready Persona (`generate()`/`runPagePipeline` no longer throw on
empty `personas`). When no ready Persona or fal errors/rate-limits, every page becomes a
deterministic placeholder-art page (no raw photo, no likeness) and the book reaches `draft`
(text-viewable) — never `failed`-with-zero-pages once text succeeded (reuses 102's degradation).
Text-pass refusal/throw/empty still terminates `failed` with retryable CTA. This placeholder-art
path is the shared fallback later reused by 164 (Learning).

(condensed 2026-07-07 — full spec in git history)
