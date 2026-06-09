# 0003 — Web-first platform for v1

- Status: Accepted
- Date: 2026-06-09

## Context

Lullabook sells a digital good (the Storybook). The platform choice dictates the
payments rail, the COPPA consent UX, and the photo-capture flow — all hard to
unwind later.

## Decision

Ship v1 as a **mobile-first responsive web app**, not a native iOS/Android app.

## Consequences

- **Positive:**
  - Payments via **Stripe (~3%)** instead of being forced into App Store /
    Play in-app purchase (**~30%**) on digital goods. On per-story unit
    economics with real GPU + LLM costs, this margin gap is decisive.
  - No app-review cycle gating every release; faster iteration for a solo dev.
  - The shareable link *is* the keepsake surface — web is the natural sharing
    medium for a Storybook.
  - Browser file/camera picker is adequate for uploading reference photos.
- **Negative / accepted:**
  - Slightly less polished camera/upload UX than native.
  - No native push; the async "your Persona is ready" moment is served by
    **email + web push** instead.

## Revisit if

- A native app becomes necessary for distribution or retention → wrap the web
  app (Capacitor) or go native once revenue justifies the IAP cut.
