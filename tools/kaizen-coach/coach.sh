#!/usr/bin/env bash
# Kaizen Domain Coach — context bundler.
# Concatenates the project's source-of-truth docs + a code inventory + the coach
# rubric into a single KAIZEN-REVIEW-BRIEF.md you can hand to an agent
# (Antigravity / Claude / Cursor) for a domain-alignment review.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CTX="$ROOT/CONTEXT"
OUT="$ROOT/KAIZEN-REVIEW-BRIEF.md"

section() { printf '\n\n---\n\n# %s\n\n' "$1" >> "$OUT"; }
dump() { # dump <label> <file>
  [ -f "$2" ] || return 0
  printf '\n\n## %s — `%s`\n\n```md\n' "$1" "${2#$ROOT/}" >> "$OUT"
  cat "$2" >> "$OUT"
  printf '\n```\n' >> "$OUT"
}

: > "$OUT"
{
  echo "# Kaizen Review Brief"
  echo
  echo "_Generated $(date '+%Y-%m-%d %H:%M') by tools/kaizen-coach/coach.sh._"
  echo
  echo "Hand this to your agent with: \"Act as the Kaizen Domain Coach."
  echo "Follow tools/kaizen-coach/COACH.md against this brief.\""
} >> "$OUT"

section "Glossary (canonical vocabulary)"
dump "Glossary" "$CTX/CONTEXT.md"

section "ADRs (load-bearing decisions)"
if compgen -G "$CTX/docs/adr/*.md" > /dev/null; then
  for f in "$CTX"/docs/adr/*.md; do dump "ADR" "$f"; done
fi

section "Planning (stack, PRD, etc.)"
if compgen -G "$CTX/planning/*.md" > /dev/null; then
  for f in "$CTX"/planning/*.md; do dump "Plan" "$f"; done
fi

section "Issues (tracer-bullet slices)"
if compgen -G "$CTX/issues/*.md" > /dev/null; then
  for f in "$CTX"/issues/*.md; do dump "Issue" "$f"; done
fi

section "Code inventory (tracked files, excluding CONTEXT/)"
{
  echo '```'
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT" ls-files | grep -v '^CONTEXT/' | grep -v '^tools/kaizen-coach/' || echo "(no code files yet — greenfield)"
  else
    echo "(not a git repo)"
  fi
  echo '```'
} >> "$OUT"

section "Coach rubric"
dump "Rubric" "$ROOT/tools/kaizen-coach/COACH.md"

echo "Wrote ${OUT#$ROOT/}"
echo "Next: open it in Antigravity and ask the agent to run the Kaizen Domain Coach."
