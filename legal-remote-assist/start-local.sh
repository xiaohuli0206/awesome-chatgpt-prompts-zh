#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  echo "[INFO] 未检测到 node_modules，开始安装依赖..."
  npm install
fi

if [ ! -f certs/server.crt ] || [ ! -f certs/server.key ]; then
  echo "[INFO] 未检测到 TLS 证书，自动生成开发证书..."
  mkdir -p certs
  openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
    -keyout certs/server.key -out certs/server.crt \
    -subj "/CN=localhost"
fi

HOST_IP="${HOST_IP:-127.0.0.1}"
PORT="${PORT:-8443}"
URL="https://${HOST_IP}:${PORT}"

echo "[INFO] 启动服务: ${URL}"
node server/index.js &
SERVER_PID=$!

cleanup() {
  echo "\n[INFO] 正在停止服务..."
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
fi

wait "$SERVER_PID"
