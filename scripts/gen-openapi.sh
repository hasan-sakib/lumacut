#!/usr/bin/env bash
# Exports the API's OpenAPI document (without starting a server) and generates TS types from it.
# Usage: scripts/gen-openapi.sh [out_dir]   (default: apps/web/src/api/generated)
set -euo pipefail
unset VIRTUAL_ENV  # always use the repo .venv

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/apps/web/src/api/generated}"
mkdir -p "$OUT"

uv run --project "$ROOT" python -I -c '
import json, sys
from lumacut_api.main import create_app
from lumacut_api.settings import Settings
app = create_app(Settings(log_json=False), health_checks={})
json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
' > "$OUT/openapi.json"

(cd "$ROOT/apps/web" && pnpm exec openapi-typescript "$OUT/openapi.json" -o "$OUT/schema.d.ts" >/dev/null)
echo "generated: $OUT/openapi.json"
echo "generated: $OUT/schema.d.ts"
