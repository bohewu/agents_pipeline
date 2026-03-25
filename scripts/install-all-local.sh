#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install all supported local agent/runtime assets from this repository.

Usage:
  scripts/install-all-local.sh [options]

Options:
  --opencode-target <path>  Override OpenCode core install target
  --plugin-target <path>    Override OpenCode status plugin entry file target
  --copilot-target <path>   Override Copilot agents install target
  --claude-target <path>    Override Claude agents install target
  --codex-target <path>     Override Codex config install target
  --dry-run                 Print actions without writing files
  --no-backup               Skip backups in underlying installers
  --force-codex             Accepted for backward compatibility; Codex overwrite is already enabled by default
  -h, --help                Show this help

Includes:
  - OpenCode core assets
  - OpenCode status plugin only (OpenCode-only; not for Claude/Copilot/Codex)
  - Copilot agents
  - Claude agents
  - Codex config
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
NO_BACKUP=0
FORCE_CODEX=0
OPENCODE_TARGET=""
PLUGIN_TARGET=""
COPILOT_TARGET=""
CLAUDE_TARGET=""
CODEX_TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode-target)
      OPENCODE_TARGET="$2"
      shift 2
      ;;
    --plugin-target)
      PLUGIN_TARGET="$2"
      shift 2
      ;;
    --copilot-target)
      COPILOT_TARGET="$2"
      shift 2
      ;;
    --claude-target)
      CLAUDE_TARGET="$2"
      shift 2
      ;;
    --codex-target)
      CODEX_TARGET="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-backup)
      NO_BACKUP=1
      shift
      ;;
    --force-codex)
      FORCE_CODEX=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

OPEN_CODE_CMD=(bash "${SCRIPT_DIR}/install.sh")
PLUGIN_CMD=(bash "${SCRIPT_DIR}/install-plugin-status-runtime.sh")
COPILOT_CMD=(bash "${SCRIPT_DIR}/install-copilot.sh")
CLAUDE_CMD=(bash "${SCRIPT_DIR}/install-claude.sh")
CODEX_CMD=(bash "${SCRIPT_DIR}/install-codex.sh")

if [[ ${DRY_RUN} -eq 1 ]]; then
  OPEN_CODE_CMD+=(--dry-run)
  PLUGIN_CMD+=(--dry-run)
  COPILOT_CMD+=(--dry-run)
  CLAUDE_CMD+=(--dry-run)
  CODEX_CMD+=(--dry-run)
fi
if [[ ${NO_BACKUP} -eq 1 ]]; then
  OPEN_CODE_CMD+=(--no-backup)
  PLUGIN_CMD+=(--no-backup)
  COPILOT_CMD+=(--no-backup)
  CLAUDE_CMD+=(--no-backup)
  CODEX_CMD+=(--no-backup)
fi

if [[ -n "${OPENCODE_TARGET}" ]]; then
  OPEN_CODE_CMD+=(--target "${OPENCODE_TARGET}")
fi
if [[ -n "${PLUGIN_TARGET}" ]]; then
  PLUGIN_CMD+=(--target "${PLUGIN_TARGET}")
fi
if [[ -n "${COPILOT_TARGET}" ]]; then
  COPILOT_CMD+=(--target "${COPILOT_TARGET}")
fi
if [[ -n "${CLAUDE_TARGET}" ]]; then
  CLAUDE_CMD+=(--target "${CLAUDE_TARGET}")
fi
if [[ -n "${CODEX_TARGET}" ]]; then
  CODEX_CMD+=(--target "${CODEX_TARGET}")
fi
if [[ ${FORCE_CODEX} -eq 1 ]]; then
  CODEX_CMD+=(--force)
fi

echo "Running local installers with shared flags: dry-run=${DRY_RUN}, no-backup=${NO_BACKUP}"
echo "Note: status plugin installation applies to OpenCode only."
echo

"${OPEN_CODE_CMD[@]}"
echo
"${PLUGIN_CMD[@]}"
echo
"${COPILOT_CMD[@]}"
echo
"${CLAUDE_CMD[@]}"
echo
"${CODEX_CMD[@]}"

echo
if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "All local installers completed in dry-run mode."
else
  echo "All local installers completed."
fi
