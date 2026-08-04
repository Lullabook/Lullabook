# Issue tracker: GitHub Projects

GitHub Projects is the workflow board for this repo. GitHub Issues and pull requests
are the durable ticket/code artifacts; the project's single-select `Status` field is
the canonical workflow state. Use the `gh` CLI for all operations.

## Configuration

```text
Repository: Lullabook/Lullabook
Project owner: <user-or-organization>
Project number: <number from the project URL>
Status field: Status
```

Verify the repository and project before writing:

```bash
gh repo view --json nameWithOwner
gh project view <project-number> --owner <project-owner> --format json
gh auth status
```

Project writes require the CLI `project` scope; read-only discovery requires
`read:project`:

```bash
gh auth refresh -s project
# or, for read-only discovery:
gh auth refresh -s read:project
```

Never place tokens in this file, issue bodies, or handoffs.

## Workflow state

The project must have one `Status` single-select field with these exact options:

```text
Planned, Agent Ready, Coding, Debugger Ready, Debugging,
Review Ready, Reviewing, Done, Canceled, Duplicate
```

Labels are metadata only. Do not use labels as a second stage machine. Review
built-in Project workflows: GitHub can set `Done` when an issue closes or a pull
request merges, which must be disabled or constrained when only the independent
reviewer may set `Done`.

## Conventions

- **Create an issue:** `gh issue create --repo Lullabook/Lullabook --title "..." --body-file <file>`
- **Add it to the project:** `gh project item-add <project-number> --owner <project-owner> --url <issue-url> --format json`
- **Read an issue:** `gh issue view <number> --repo Lullabook/Lullabook --comments`
- **List project items:** `gh project item-list <project-number> --owner <project-owner> --format json --limit 100`
- **Comment:** `gh issue comment <number> --repo Lullabook/Lullabook --body-file <file>`
- **Labels:** `gh issue edit <number> --repo Lullabook/Lullabook --add-label "..."` / `--remove-label "..."` for category/triage metadata only.
- **Close:** only after the appropriate workflow decision; closing is not a substitute for setting Project `Status`.

Inspect live field and option IDs before scripting a status mutation:

```bash
gh project field-list <project-number> --owner <project-owner> --format json
gh project item-list <project-number> --owner <project-owner> --format json --limit 100
```

Move a non-draft project item with the returned GraphQL node IDs:

```bash
gh project item-edit \
  --id <project-item-id> \
  --project-id <project-node-id> \
  --field-id <status-field-id> \
  --single-select-option-id <status-option-id> \
  --format json
```

Read the project item back after every mutation. A successful CLI exit is not
evidence that the field changed.

## Local work items

Tracer-bullet slices also live as markdown under `CONTEXT/issues/` (dependency-ordered).
Skills should read those files when working in-repo; publishing requires a GitHub
issue added to the configured Project and a read-back-confirmed `Status`.

## When a skill says “publish to the issue tracker”

Create a GitHub issue, add it to the configured GitHub Project, set its Project
`Status`, and read the item back. Do not leave a ticket only in a local markdown
mirror.

## When a skill says “fetch the relevant ticket”

Run `gh issue view <number> --repo Lullabook/Lullabook --comments`, then fetch its
project item with `gh project item-list` when stage matters.

## Wayfinding operations

### The map

A single GitHub issue labelled `wayfinder:map`, added to the configured Project. Its
body holds `## Notes`, `## Decisions so far`, and `## Fog`. Every ticket is added to
the same Project; `wayfinder:<type>` labels are taxonomy only.

### Tickets and blocking

Each ticket carries the map-slug label, exactly one type label
(`wayfinder:research` | `wayfinder:prototype` | `wayfinder:grilling` |
`wayfinder:task`), and `wayfinder:claimed` once a session claims it. Body:

```markdown
## Question
<the decision or investigation this ticket resolves>

---
Part of the map: #<map-issue>
Blocked by: #<n>, #<m>        <!-- omitted when nothing blocks it -->
```

Use GitHub's native sub-issue/dependency relationship where available. Otherwise,
the `Blocked by` body line is the fallback. The Project `Status` field is the stage;
the issue's open/closed state is not.

### Resolving a ticket

Post the answer as a resolution comment, update the Project `Status` and read it
back, close the issue only when the configured workflow allows it, and append a
one-line pointer to the map's `## Decisions so far`. Link created assets from the
issue; don't paste them in. A resolved chunk that has become grillable re-enters
`/planner`.
