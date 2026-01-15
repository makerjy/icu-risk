#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_CMD=""

if [[ -x "${ROOT_DIR}/.venv/bin/uvicorn" ]]; then
  BACKEND_CMD="${ROOT_DIR}/.venv/bin/uvicorn server_fastapi.app:app --reload --env-file ${ROOT_DIR}/.env"
else
  BACKEND_CMD="uvicorn server_fastapi.app:app --reload --env-file ${ROOT_DIR}/.env"
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "Starting FastAPI..."
(cd "${ROOT_DIR}" && ${BACKEND_CMD}) &
BACKEND_PID=$!

echo "Starting Vite..."
(cd "${ROOT_DIR}" && npm run dev) &
FRONTEND_PID=$!

echo "FastAPI PID: ${BACKEND_PID}"
echo "Vite PID: ${FRONTEND_PID}"
echo "Press Ctrl+C to stop both."

wait
