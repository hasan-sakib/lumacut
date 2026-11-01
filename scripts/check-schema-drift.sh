#!/usr/bin/env bash
# Fails if the committed generated files differ from a fresh generation from the Zod schemas.
set -euo pipefail
unset VIRTUAL_ENV  # always use the repo .venv

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"$ROOT/scripts/gen-schema.sh" "$TMP/lumacut.schema.json" "$TMP/models.py" >/dev/null

status=0
diff -u "$ROOT/packages/schema/generated/lumacut.schema.json" "$TMP/lumacut.schema.json" || status=1
diff -u "$ROOT/packages/schema/py/lumacut_schema/models.py" "$TMP/models.py" || status=1

if [ "$status" -ne 0 ]; then
  echo "schema drift: generated files are stale. Run \`make gen-schema\` and commit the result." >&2
  exit 1
fi
echo "schema drift: generated JSON Schema and Pydantic models match packages/schema"
