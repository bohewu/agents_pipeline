#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL="${SCRIPT_DIR}/../tools/agent-profile.py"

if [[ ! -f "${TOOL}" ]]; then
  echo "Agent profile manager not found: ${TOOL}" >&2
  exit 1
fi

PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    PYTHON_BIN="${candidate}"
    break
  fi
done
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Python runtime not found. Install Python 3.11 or newer." >&2
  exit 1
fi
if ! "${PYTHON_BIN}" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "Agent profile manager requires Python 3.11 or newer." >&2
  exit 1
fi

exec "${PYTHON_BIN}" "${TOOL}" "$@"
