# Session Handoff — 2026-06-12: PRD v2 productionization one-shot COMPLETE

Status: historical

Finished the FABLE-ONESHOT productionization on `handoff/generation-pipeline-prd-v2`
(105 tests, lint/tsc/build green): composition root + auth (`createRequestContext`,
`getAuthedContext`, first sign-in auto-creates Family+Guardian), Inngest functions +
serve route, all server actions, Stripe/fal webhooks, signed-URL image resolver,
export PDF, and the full hand-rolled bedtime-design UI. README is the orientation doc.

- Binding: no CSS framework — hand-rolled design system in `src/app/globals.css`.
- Binding: Stripe `checkout.completed` mints a payment-VPC consent receipt for the Guardian; `subscription.deleted` starts the cancel/purge window.
- Binding: `/share/*` responses carry `X-Robots-Tag: noindex`; `/api/images` authorizes by `books/{familyId}/` blob prefix.
- Binding: external launch blockers stand — provider keys, CSAM hash vendor + NCMEC (ADR-0010), per-market legal sign-off (ADR-0015/0017).

(condensed 2026-07-07 — full text in git history)
