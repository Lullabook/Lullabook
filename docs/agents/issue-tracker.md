# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Local work items

Tracer-bullet slices also live as markdown under `CONTEXT/issues/` (dependency-ordered). Skills should read those files when working in-repo; use GitHub issues when publishing outward.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Where the `/wayfinder` skill's artifacts live in this repo.

### The map
A single GitHub issue labelled **`wayfinder:map`** (one per effort). Its body holds
`## Notes`, `## Decisions so far` (the index), and `## Fog`. Every one of its tickets
carries a shared **map-slug label** (e.g. `wayfinder:postr1`) so the whole ticket set
is queryable by that label; the map itself is found by `wayfinder:map`.

### Tickets
Each ticket is a GitHub issue carrying: the map-slug label; exactly one **type**
label (`wayfinder:research` | `wayfinder:prototype` | `wayfinder:grilling` |
`wayfinder:task`); and `wayfinder:claimed` once a session claims it (set **first**,
before any work). Body:
```
## Question
<the decision or investigation this ticket resolves>

---
Part of the map: #<map-issue>
Blocked by: #<n>, #<m>        <!-- omitted when nothing blocks it -->
```

### Blocking + the frontier
Blocking is the **`Blocked by: #n, #m`** body line (authoritative; matches the
`/wayfinder` local-markdown fallback — GitHub's native dependency API is not used).
A ticket is **unblocked** when every issue on its `Blocked by` line is CLOSED. The
**frontier** = open, unblocked, unclaimed tickets of a map:
```bash
gh issue list --label wayfinder:postr1 --state open --limit 100 \
  --json number,title,labels,body        # then drop wayfinder:claimed,
                                          # and any whose Blocked-by issues aren't all closed
```

### Resolving a ticket
Post the answer as a **resolution comment**, **close** the issue, and append a
one-line pointer to the map's `## Decisions so far`. Link created assets from the
issue; don't paste them in. A resolved chunk that's become grillable re-enters
`/part1`.
