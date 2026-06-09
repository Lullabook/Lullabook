# Stack & Runtime Decisions

Running record of concrete technology choices. ADR-worthy ones (hard to reverse)
also get a file under `../docs/adr/`. This file is the quick-reference index.

> **Dev tooling ≠ runtime services.** The Claude Pro plan and Cursor plan power
> *the developer's* IDE and planning. They are **not** callable by the deployed
> app. The app needs its own paid **Anthropic API key** and **fal.ai** account at
> runtime, billed separately. See [Workflow](./workflow.md).

## Generative pipeline

| Concern | Choice | Notes |
|---|---|---|
| Story text generation | **Claude Sonnet 4.6** (`claude-sonnet-4-6`) | Creative spine; ~3–5¢/story. Anthropic API key required at runtime. |
| Scene → image prompts | **One structured pass: Story + per-page Scenes + Style Bible** | [ADR-0012](../docs/adr/0012-illustration-pipeline-style-bible.md). Per-page Prompt = Style Bible + Scene + LoRA(s). |
| Art style | **Curated quality-tuned menu + optional moderated custom text note** | Parent picks a base style; may layer an experimental custom descriptor. No reference-image style uploads in v1. |
| Likeness mechanism | **Per-persona Flux LoRA** | [ADR-0002](../docs/adr/0002-per-persona-lora.md). Async, paid, per-Persona. |
| Multi-persona composition | **Sequential per-face inpaint; ref-model fallback** | [ADR-0005](../docs/adr/0005-multi-persona-scenes-in-v1.md). Gated by a pre-build spike. |
| LoRA training + image inference | **fal.ai** (managed) | Pay-per-use, no GPU ops. Migrate to self-host later if volume justifies. |
| Photo conditioning | **Yes, from day one** | [ADR-0001](../docs/adr/0001-photo-conditioned-likeness.md). Biometric data of minors — consent/COPPA/GDPR. |

## Markets & compliance

| Concern | Choice | Notes |
|---|---|---|
| Launch markets | **Asia + US (broad)** | [ADR-0015](../docs/adr/0015-multi-jurisdiction-launch.md). Per-market legal review gates each market. |
| Consent engine | **Jurisdiction-aware, configurable** | Child-age threshold, consent method, residency, notices — all per-jurisdiction config, never hardcoded. |
| Data residency | **Region-pinnable storage** | Per-market storage region (Supabase + R2/S3). |
| Market enablement | **Feature-flag per country** | Switch a market on only once its legal review + residency are ready. |

## App shell / platform

| Concern | Choice | Notes |
|---|---|---|
| v1 surface | **Mobile-first responsive web app** | [ADR-0003](../docs/adr/0003-web-first-platform.md). Avoids App Store IAP cut on digital goods; instant iteration; shareable links are the keepsake surface. Native wrapper deferred. |
| Payments rail | **Stripe** (web) | ~3% vs ~30% IAP. Enabled by the web-first choice. |
| "Persona ready" async notify | **Email + web push** | No native push needed for v1. |

## Backend / data / auth / jobs

See [ADR-0011](../docs/adr/0011-backend-architecture.md).

| Concern | Choice | Notes |
|---|---|---|
| App framework | **Next.js** (web-first) | [ADR-0003](../docs/adr/0003-web-first-platform.md). |
| Database | **Postgres (Supabase)** | Relational domain (Family→Member→Persona→Story→Page); **row-level security** enforces per-Family isolation. |
| Auth | **Supabase Auth** | Member logins, invites, Guardian role ([ADR-0006](../docs/adr/0006-family-member-guardian-model.md)). |
| Sensitive blobs | **Encrypted object storage (R2 / S3)** | Photos + LoRA weights kept out of the BaaS, with explicit lifecycle + hard-delete tooling ([ADR-0007](../docs/adr/0007-data-lifecycle-and-deletion.md)). |
| Job orchestration | **Durable workflow (Inngest / Trigger.dev)** | Retryable steps, fan-out for N page gens, `waitForEvent` on fal.ai webhooks, per-step failure isolation. |
| Payments | **Stripe** | Subscription ([ADR-0009](../docs/adr/0009-subscription-monetization.md)); card txn doubles as VPC ([ADR-0008](../docs/adr/0008-verifiable-parental-consent.md)). |

## Monetization

| Concern | Choice | Notes |
|---|---|---|
| Model | **Subscription (metered hybrid)** | Recurring plan. |
| Tier lever | **Persona cap per tier** | Personas (LoRA training) are the dominant cost; higher tier = more Personas allowed. |
| Books | **Unlimited, fair-use** | No marketed book cap, but a soft anti-abuse ceiling + the per-book re-roll budget ([ADR-0004](../docs/adr/0004-curated-versioned-storybook.md)) stay enforced — "unlimited" ≠ uncapped compute. |
| Re-rolls | **Budgeted per book** | Free re-rolls included; extra re-rolls are credit-metered. |
| On cancel | **Export-then-purge** | [ADR-0007](../docs/adr/0007-data-lifecycle-and-deletion.md). 30-day export window → hard-delete sensitive data. |
| Physical print | **Later upsell** | Not v1. |

---
_Last updated during grill-with-docs session, 2026-06-09._
