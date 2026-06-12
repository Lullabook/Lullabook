# Kaizen Production Coach — PRODUCTION-COACH.md

Welcome to the **Kaizen Production Coach** guidelines. This document outlines the manual and agentic checks performed by the Antigravity agent during the "Kaizen Production" phase. While the Domain Coach (`coach.sh`) acts as an automated linter for domain terminology, this Production Coach ensures that code is actually ready for deployment.

## Purpose

The Kaizen Production Coach is a rigorous quality gate designed to answer: *Is this software safe for children's photos and production traffic?*

## Antigravity's Production Checklist

When Antigravity is invoked to run the Production Coach, it must verify the following dimensions:

### 1. Infrastructure Wiring (Real vs. Fake)
- **Database**: Ensure that the implementation uses real Postgres and not an in-memory `DataStore`.
- **Row-Level Security (RLS)**: Verify that Postgres RLS policies are actually applied and enforced at the database level.
- **Adapters**: Check that integration tests validate the actual adapter contracts against live or staged provider endpoints (e.g. Supabase, Stripe, fal.ai, Anthropic).

### 2. E2E and Auth Flows
- Ensure there are complete, testable flows (typically validated by Hermes) for:
  - Supabase Sign-up
  - Roster creation
  - Baby Persona Consent Gate

### 3. Workflow Durability
- Validate that async jobs (e.g., LoRA training, background generation) are using durable job processors (like Inngest or Trigger.dev).
- Verify that retries and webhook handlers are implemented correctly.

### 4. Security and Compliance
- **HITL Gates**: For issues tagged `launch-blocker` (e.g. CSAM/NCMEC vendor integration, legal sign-offs), ensure that Human-In-The-Loop approval has been given.
- **Secrets Management**: Verify that there are no hardcoded secrets and that the production environment variables are properly documented.
- **Deletion Propagation Proof**: Manually audit the `hard-delete` flow to guarantee that it purges data across *both* the database and blob storage.

### 5. Documentation Loop
- If the implementation has caused any behavior to change from the initial design, require an amendment to the relevant ADR in `CONTEXT/docs/adr/`.

## How to use this Coach

When an issue reaches the **Kaizen Production** stage, the agent (Antigravity) will read this document and perform the necessary manual checks and exploratory tests to prove these invariants hold true. The agent will then generate a brief stating whether the PR/issue passes the Production Gate.
