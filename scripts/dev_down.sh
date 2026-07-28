#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.anvil-seed.pid"

if [[ ! -f "${PID_FILE}" ]]; then
    while IFS= read -r pid; do
        command_name="$(ps -p "${pid}" -o comm= 2>/dev/null || true)"
        if [[ "${command_name##*/}" == "anvil" ]]; then
            kill "${pid}"
        fi
    done < <(lsof -tiTCP:8545 -sTCP:LISTEN 2>/dev/null || true)
    exit 0
fi

PID="$(<"${PID_FILE}")"
if [[ "${PID}" =~ ^[0-9]+$ ]] && kill -0 "${PID}" 2>/dev/null; then
    kill "${PID}"
    wait "${PID}" 2>/dev/null || true
fi
rm -f "${PID_FILE}"
