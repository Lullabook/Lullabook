# 0013 — Storybook sharing is private-by-default with revocable links

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0006](0006-family-member-guardian-model.md)

## Context

A Storybook is the shareable keepsake, but every share exposes a real, named
child's likeness. A naive public URL is forwardable, search-indexable, and
scrapable — unacceptable for a product whose trust premise is protecting a child.

## Decision

- **Within the Family:** finalized Storybooks are visible to all Members (shared
  family artifact). **Drafts are private to the creating Member** until finalized.
- **Outside the Family:** sharing is an explicit per-book action that mints a
  **revocable share link** — **no search-engine indexing**, optional
  expiry/passcode, and a one-time **warning** that the link exposes the child's
  likeness and name.
- **Revocation is immediate** and available at any time.

## Consequences

- Share links are first-class, access-controlled objects (revocation, expiry,
  no-index headers), not bare public URLs.
- Slightly more sharing friction and less virality than public links — accepted
  as correct for a product handling minors' likenesses.

## Revisit if

- A privacy-preserving public-gallery feature (e.g. opt-in, faces-blurred
  previews) is ever justified.
