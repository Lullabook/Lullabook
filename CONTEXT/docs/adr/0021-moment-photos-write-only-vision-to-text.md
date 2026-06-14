# Moment photos are write-only input, conditioning Stories via vision→text only

Status: accepted (2026-06-14)

## Context

PRD v6 modeled a [Moment](../../CONTEXT.md) as light structure (free text + date +
linked people + a `significant` flag) and **deliberately deferred** photo and mood
attachments to a later "rich-structure" pass. PRD v8 adds **photo-to-story**: a
parent drops a real photo from today and a short Story is seeded from it.

A Moment photo is unlike the roster reference photos. It is a candid scene
("Maya in the garden with a yellow ball"), it will routinely contain real faces,
and it is captured to make a *Story*, not to train likeness. Two existing
decisions bear on it:

- **ADR-0020** established that the interface **never renders a raw uploaded
  photo** — the minor's real face does not appear on display surfaces. A Moment
  photo shown in the Journal would reintroduce exactly that.
- **ADR-0001 / ADR-0002** make likeness from per-person LoRAs, and the
  illustration style comes from the Style Bible (ADR-0012). A Moment photo used as
  a visual reference for the page art would fight both and is hard to keep
  deterministic/idempotent (issue 16).

## Decision

A **Moment photo** is **write-only generation input**, never a display surface,
and conditions a Story **only as text**.

- **Never displayed.** The raw photo is never rendered on any surface — the
  Journal, the Reader, member pickers, anywhere — on web or mobile. This extends
  the ADR-0020 invariant from roster photos to Moment photos. The parent sees the
  resulting *Story*, not the snapshot.
- **Vision→text conditioning only.** A vision model reads the photo into a scene
  description; that description seeds the [Brief](../../CONTEXT.md) /
  [auto-context layer](../../CONTEXT.md) so the Story text — and therefore the
  normal LoRA + Style Bible illustration — reflects what happened. The photo's
  pixels never condition the art.
- **Retained, write-only, Family-scoped.** The raw photo is kept in the blob store
  under the Family-scoped key space so it can be re-extracted or re-generated
  later. It is **never** used to train a likeness LoRA.
- **Rides existing consent and hard-delete.** A Moment belongs to exactly one Baby
  and carries no new consent gate (PRD v6); the photo it carries is new biometric
  data covered by that Baby's existing consent (ADR-0008/0014) and is erased by
  hard-delete / purge (ADR-0007) like everything else Family-scoped. It opens **no
  new** consent flow and **no new** deletion path.

## Why (the trade-off)

- It keeps the strong privacy default of ADR-0020 intact: even as we add photos to
  the capture loop, no real face is ever rendered in the interface, and the photo
  never becomes likeness-training data.
- Vision→text keeps the generation pipeline unchanged and deterministic — the
  photo enriches *what* the Story is about without destabilizing *how* it is drawn.
  We avoid a visual-conditioning quality spike against the LoRA/Style Bible.
- Retaining the photo (rather than extract-then-discard) buys re-derivation and
  regeneration later, at the cost of a larger biometric-retention surface — which
  the Family-scoped hard-delete path already covers.

The cost we accept: retained Moment photos enlarge the stored-biometric surface
(mitigated by hard-delete), and the Story reflects only what the vision model can
*describe*, not the exact composition of the photo.

## Consequences

- The Moment model gains an optional photo attachment (the v6 deferred
  rich-structure), stored Family-scoped, with no new display code path.
- The create-Story-from-Moment path gains a vision→text step that turns an
  attached photo into a scene description feeding the Brief / auto-context.
- No raw Moment-photo `<img>` may appear on any surface, web or mobile — the
  ADR-0020 UI invariant now also covers Moment photos.
- Does **not** alter ADR-0001/0002/0012: likeness training, per-persona LoRA, and
  the Style Bible are unchanged. This ADR governs *capture + text conditioning*,
  not *training* or *art*.
