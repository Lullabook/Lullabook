#!/usr/bin/env bash
# Lullabook UI snapshot — captures a screenshot of every mobile route into ./screens/.
# Re-run after ANY UI change so this folder always reflects the current app.
#
# Prereqs (see CONTEXT/ui-snapshots/README.md):
#   1. Backend:  npm run dev:paid                     # repo root, :3001, sub active
#   2. App:      cd mobile && npx expo start --ios --clear   # Metro + Simulator (default host!)
#   3. Signed in (dev creds auto-apply: simulator@lullabook.dev)
#
# Usage:
#   ./refresh.sh                      # auto-detect Metro host (LAN IP via en0)
#   EXPO_HOST=127.0.0.1 ./refresh.sh  # override host
#   DELAY=4 ./refresh.sh              # slower devices / data-heavy screens
set -uo pipefail

HOST="${EXPO_HOST:-$(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1)}"
PORT="${EXPO_PORT:-8081}"
DELAY="${DELAY:-3}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/screens"
mkdir -p "$OUT"

# name | deep-link path.  Dynamic [id] routes use a placeholder id — with an empty
# account they render the not-found / empty / "loading" state (noted in README).
routes=(
  "01-sign-in|/sign-in"
  "02-sign-up|/sign-up"
  "03-home|/"
  "04-stories|/stories"
  "05-create|/create"
  "06-family|/family"
  "07-settings|/settings"
  "08-daily|/daily"
  "09-billing|/billing"
  "10-characters|/characters"
  "11-characters-new|/characters/new"
  "12-family-new|/family/new"
  "13-story-reader-id|/stories/sample-id"
  "14-family-detail-id|/family/sample-id"
  "15-character-detail-id|/characters/sample-id"
  "16-not-found|/__no_such_route__"
)

echo "Metro: exp://$HOST:$PORT   →   $OUT   (delay ${DELAY}s)"
ok=0
for entry in "${routes[@]}"; do
  name="${entry%%|*}"; path="${entry#*|}"
  url="exp://$HOST:$PORT/--$path"
  xcrun simctl openurl booted "$url" >/dev/null 2>&1 || echo "  ! openurl failed: $url"
  sleep "$DELAY"
  if xcrun simctl io booted screenshot "$OUT/$name.png" >/dev/null 2>&1; then
    echo "  ✓ $name.png   ($path)"; ok=$((ok+1))
  else
    echo "  ! screenshot failed: $name"
  fi
done
echo "Done — $ok/${#routes[@]} screens captured into $OUT"
echo "Last refreshed: $(date '+%Y-%m-%d %H:%M:%S')" > "$DIR/LAST-REFRESHED.txt"
