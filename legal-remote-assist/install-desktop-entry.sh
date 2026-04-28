#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_SRC="$APP_DIR/desktop/LegalRemoteAssist.desktop"
DESKTOP_DST="$HOME/Desktop/LegalRemoteAssist.desktop"

sed "s|__APP_DIR__|$APP_DIR|g" "$DESKTOP_SRC" > "$DESKTOP_DST"
chmod +x "$DESKTOP_DST"

echo "[OK] 已生成桌面启动文件: $DESKTOP_DST"
