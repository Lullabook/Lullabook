# 74 — Bearer API for Moments (create/list) + mobile client

Triage: ready-for-agent

## What to build
The first parity-backbone slice: expose the existing Moment service to the native app
over the Bearer-authenticated API, and add the typed mobile client. No new domain
logic — `src/services/moment.ts` already does create/list/scoping/purge (issue 50).

- `POST /api/moments` — create a Moment for the caller's selected Baby from the Bearer
  token's Member. Body: `body`/`text`, `momentType`, `occurredOn` (defaults today),
  optional `linkedPeople`, `significant`. Returns the created Moment.
- `GET /api/moments?babyId=…` — reverse-chronological list for that Baby, Family-scoped.
- Both reuse the existing Bearer-auth resolution used by `/api/home` (token → Member →
  Family) and the existing service-layer ownership checks.
- `mobile/lib/api.ts`: add `createMoment(...)` and `listMoments(babyId)` typed against
  the shared `@domain/types`.

## Acceptance criteria
- With a valid Bearer token a Member can create a Moment and list their Baby's Moments;
  without a token both routes return **401**.
- Moments are Family/Baby-scoped — a Member never reads another Family's Moments.
- Routes are tested at the service seam with adapters faked (401 path + scoping +
  create→list round-trip); all existing web tests stay green.
- No web UI changes; no migration (table exists from issue 50).

## Blocked by
50 (moment service + table). Nothing else.
