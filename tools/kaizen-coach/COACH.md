# Kaizen Domain Coach — COACH.md

Welcome to the **Kaizen Domain Coach** guidelines. This document describes the checks performed by the coach script (`tools/kaizen-coach/coach.sh`) and provides guidance on how to interpret and resolve issues identified during audits.

## Purpose

The Kaizen Domain Coach is a specialized quality gate for the **Lullabook** project. It helps developers and AI agents (such as Antigravity and Cursor) ensure that:
1. The codebase adheres strictly to the project's canonical glossary (`CONTEXT/CONTEXT.md`).
2. Architectural non-negotiables defined in the ADRs (like row-level security, adapter interfaces, and child safety gates) are respected.
3. No secrets are accidentally committed.
4. Code organization guidelines (such as placing context documents in folders) are enforced.

## Auditing and Remediation

When you run `bash tools/kaizen-coach/coach.sh`, it generates a `KAIZEN-REVIEW-BRIEF.md` file in the project root containing a summary of violations. Use the following guide to resolve them:

### 1. Glossary Compliance
- **Incorrect Term:** "Parent Persona"
  - **Why:** The glossary defines only two types of personas: `Baby Persona` (starring child) and `Adult Persona` (co-starring adult member). A grandparent or aunt is an adult but not a parent.
  - **Fix:** Rename to `Adult Persona` or `Adult` in both code and UI text.
- **Incorrect Term:** "soft-delete", "soft delete", "archive" (when referring to family data removal)
  - **Why:** Immediate, total erasure is a critical legal and PRD requirement ("right to be forgotten"). Retaining data under soft-deletes or archives violates COPPA and GDPR.
  - **Fix:** Change implementation and terminology to `hard-delete`.
- **Incorrect Term:** "country" (in settings or residency detection)
  - **Why:** Jurisdiction is the legal-regime unit, not strictly geographic. Different states or regions may have distinct legal thresholds regardless of the country.
  - **Fix:** Use the term `jurisdiction`.
- **Incorrect Term:** "User" (in domain logic)
  - **Why:** Too generic. We use `Family` as the container account and `Member` (or `Guardian` for parent accounts) as the human login.
  - **Fix:** Use `Member` or `Family` in domain models and interfaces.

### 2. Architecture Guidelines (ADRs)
- **RLS Isolation:** Every database access model must respect Postgres Row-Level Security (RLS) policies.
  - **Fix:** Check that database queries use RLS constraints or that schema migrations include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- **Mocked Adapters:** External API calls (fal.ai, Anthropic, moderation, liveness) must live behind adapters and be faked in unit/integration tests.
  - **Fix:** Check that tests use in-memory stubs or fakes instead of making live network requests.
- **Child Safety Gate:** Photos of minors must not be sent to training or storage before moderation and consent gates.
  - **Fix:** Ensure a Baby Persona registration invokes `ConsentEngine` and `ModerationService`.

### 3. Secret Protection
- **Secrets:** API keys, passwords, and `.env` files must never be committed to Git.
  - **Fix:** Add any config files with secrets to `.gitignore` and use environment variables.

---
*Last Updated: June 2026*
