#!/usr/bin/env bash
# Fails if the committed OpenAPI document / TS types differ from what the API code generates.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"$ROOT/scripts/gen-openapi.sh" "$TMP" >/dev/null

status=0
for f in openapi.json schema.d.ts; do
  diff -u "$ROOT/apps/web/src/api/generated/$f" "$TMP/$f" || status=1
done
if [ "$status" -ne 0 ]; then
  echo "openapi drift: generated API types are stale. Run \`make gen-openapi\` and commit." >&2
  exit 1
fi
echo "openapi drift: generated API types match services/api"
