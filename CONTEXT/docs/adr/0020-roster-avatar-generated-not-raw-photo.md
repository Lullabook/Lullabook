# Roster members display a generated avatar, never the raw uploaded photo

Status: accepted (2026-06-14)

## Context

Adding a family-roster member (a [Persona] in current code — Baby or adult)
uploads real reference photos, which are stored in the blob store and used to
train a per-person likeness LoRA (ADR-0001, ADR-0002). Today the UI surfaces the
raw uploaded selfie/photo directly as the member's picture.

Two concerns pushed against that:

- **Privacy of a minor.** The Baby is the star of the product, and showing the
  child's actual uploaded face on roster cards and throughout the app is the most
  exposed possible default. The likeness model needs the photos; the *interface*
  does not need to render them.
- **Consistency / polish.** Raw uploaded selfies vary wildly (lighting, crop,
  background). A uniform, clean illustrated avatar reads as a finished product.

The likeness LoRA already exists and can render the person in the book's
illustration style. So a clean, on-brand avatar of the *actual person* is
available essentially for free once training completes.

## Decision

Every roster member — **Baby and adults alike** — is displayed via a generated
**Roster avatar**, never via their raw uploaded photo.

- Raw uploaded reference photos are **retained** in the blob store and remain the
  input to likeness training, which drives Story illustration and (later) video
  generation. Their role is unchanged.
- The raw photos are **never rendered on any display / cosmetic surface** — roster
  cards, story credits, member pickers, anywhere a member's picture appears.
- The Roster avatar is generated once the member's LoRA reaches `ready`: one clean
  portrait is rendered through the existing image pipeline using that person's
  LoRA and stored as the member's avatar. While the LoRA is `training` (or
  `failed`), a neutral placeholder stands in.
- A member can **update / replace their reference photos** at any time. Doing so
  re-runs training and **regenerates the Roster avatar**; the photos are still
  never displayed, only swapped.

## Why (the trade-off)

- It gives the minor the strongest privacy default — the child's real face never
  appears in the interface — while keeping the full-likeness pitch intact, because
  the photos still train the model that makes the stories look like the real
  family.
- The avatar resembles the actual person (it is rendered from their LoRA), so we
  do not lose the "that's *us*" recognition that a generic icon or preset would
  throw away.
- It buys visual consistency for free: every avatar is rendered in one style
  rather than a grid of mismatched phone selfies.

The cost we accept: the avatar is unavailable until training finishes (hence the
placeholder window), and each member costs one extra image generation at
training-complete and on every photo update.

## Consequences

- The persona/training-complete path gains an avatar-generation step (extend the
  `ready` branch that currently only flips status), producing and storing an
  avatar blob key on the member.
- A member needs an `avatarKey` (nullable; null ⇒ render placeholder) and an
  "update reference photos" action that re-enters training and clears/regenerates
  the avatar.
- No raw-photo `<img>` may be introduced on display surfaces in web **or** mobile;
  this is a standing UI invariant, not a one-screen change.
- Avatars live in the blob store under the Family-scoped key space, so
  hard-delete/purge (ADR-0007) erases them with everything else — no new deletion
  path.
- Does **not** alter ADR-0001/0002: photo-conditioned likeness and per-persona
  LoRA are unchanged. This ADR governs *display*, not *training*.

[Persona]: ../../CONTEXT.md
