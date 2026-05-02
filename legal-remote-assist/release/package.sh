#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
OUT="$DIST_DIR/legal-remote-assist-local.zip"

mkdir -p "$DIST_DIR"
rm -f "$OUT"

cd "$ROOT_DIR"
zip -r "$OUT" \
  . \
  -x "node_modules/*" \
     "dist/*" \
     "logs/connections.log" \
     "certs/server.crt" \
     "certs/server.key" \
     ".env"

echo "[OK] package created: $OUT"
