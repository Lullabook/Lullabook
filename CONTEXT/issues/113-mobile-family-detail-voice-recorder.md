# 113 — Mobile family-member detail screen + voice recorder

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
There is no `mobile/app/family/[id].tsx` — tapping a roster member does nothing, and there
is no way to attach voice on mobile. Build the **family-member detail screen** (reached from
the roster rows) with a **voice recorder** (expo-av/expo-audio): capture consent → record →
transcript → attach via the issue-112 API. UI reflects the Our-Whole-Family capability gate;
the server 403 stays the real boundary. Style with `lullabook-design`.

## Acceptance criteria
- [ ] Tapping a roster member opens a detail screen (today: nothing).
- [ ] A member can record + attach a voice clip with consent captured and a transcript;
      audio-permission denial has a defined path.
- [ ] UI reflects the capability gate; the server 403 remains the boundary.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
112
