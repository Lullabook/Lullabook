# Lullabook Mobile — Navigation Map

Every route in the Expo app (`mobile/app/`, expo-router file-based) and where each button
leads. Screenshot for each is in `screens/<NN>-<name>.png`. Source lines cited as
`file:line`. Generated for GLM 5.2 / planning agents.

## Structure

- **Root** `app/index.tsx` → `<Redirect href="/(tabs)">` (`app/index.tsx:4`). The tab group
  guards auth: unauthenticated users are `router.replace("/sign-in")`'d from every tab.
- **Tab bar** (bottom): **Home · Stories · Create · Family · Settings** (`app/(tabs)/_layout.tsx`).
- **Stack (outside tabs)**: sign-in, sign-up, daily, billing, characters/*, family/*.

## Auth

### `01-sign-in` — `/sign-in` (`app/sign-in.tsx`)
- Sign in (success) → **/(tabs)** home (`:42`, `:48`)
- "Create account" → **/sign-up**
- Dev sign-in block uses `simulator@lullabook.dev` (auto in dev builds)

### `02-sign-up` — `/sign-up` (`app/sign-up.tsx`)
- Sign up (success) → **/(tabs)** home (`:54`, `:79`)
- "Already have an account? Sign in" → **/sign-in** (`:122`)

## Tabs

### `03-home` — `/` (`app/(tabs)/index.tsx`) — "Your baby's World"
- "Start a new story" / Create card → **/create** (`:60`)
- "Your baby's Journal" / "What happened today?" → **/daily** (`:76`, `:110`)
- "Continue reading" / "This week" → **/stories** (`:94`, `:126`)
- Family card → **/family** (`:142`)
- Not authed → **/sign-in** (`:23`)

### `04-stories` — `/stories` (`app/(tabs)/stories/index.tsx`) — library
- Tap a story row → **/stories/{id}** reader (`:82`)
- Empty-state CTA → **/create** (`:66`)
- Not authed → **/sign-in** (`:37`)

### `05-create` — `/create` (`app/(tabs)/create/index.tsx`) — Brief → generate
- "🐻 Invent a character" → **/characters/new** (`:134`)
- "Generate" → `createStorybook()` then → **/stories/{newId}** reader (`:78`, `:85`)
- Not authed → **/sign-in** (`:44`)

### `06-family` — `/family` (`app/(tabs)/family.tsx`) — roster
- Tap a member row → **/family/{id}** detail (`:82`)
- "Add family member" → **/family/new** (`:99`)
- "Characters" → **/characters** (`:115`)
- Not authed → **/sign-in** (`:23`)

### `07-settings` — `/settings` (`app/(tabs)/settings/index.tsx`)
- "Manage plan" / billing → **/billing** (`:117`, `:119`)
- Sign out → **/sign-in** (`:34`, `:65`)

## Stack screens

### `08-daily` — `/daily` (`app/daily.tsx`) — log a Moment (Journal capture)
- Not authed → **/sign-in** (`:87`)

### `09-billing` — `/billing` (`app/billing.tsx`) — two-plan paywall
- Monthly / Annual segmented toggle (`:124`); plan cards (Just Us / Our Whole Family)
- ⚠️ has a nested `ScrollView` inside `Screen` (`:143`) — scroll bug (UI audit)

### `10-characters` — `/characters` (`app/characters/index.tsx`) — fictional characters
- "New character" → **/characters/new** (`:73`)
- Tap a character row → **/characters/{id}**
- Not authed → **/sign-in** (`:21`)

### `11-characters-new` — `/characters/new` (`app/characters/new.tsx`) — Trait Questionnaire
- Submit → back to characters list

### `12-family-new` — `/family/new` (`app/family/new.tsx`) — add Persona (photos + consent)
- Submit (success) → **/(tabs)** (`:115`)
- Consent checkbox is a custom Pressable (`:202`); training starts on submit (`:210`)

### Dynamic detail routes (placeholder id in `refresh.sh`)
- `13-story-reader-id` — `/stories/[id]` (`app/(tabs)/stories/[id].tsx`) — paged reader,
  per-page re-roll, voice playback. Back → previous. Not authed → /sign-in (`:125`).
- `14-family-detail-id` — `/family/[id]` (`app/family/[id].tsx`) — voice recorder + clips.
  Not authed → /sign-in (`:46`). (Audio needs a dev build; no-ops in Expo Go.)
- `15-character-detail-id` — `/characters/[id]` (`app/characters/[id].tsx`) — edit character.
  Not authed → /sign-in (`:38`).

### `16-not-found` — `+not-found` (`app/+not-found.tsx`)
- "Go home" → **/** (`:18`)

---
_Regenerate with `CONTEXT/ui-snapshots/refresh.sh` after UI changes. See README.md._
