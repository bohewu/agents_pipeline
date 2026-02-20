#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install VS Code Copilot custom agents generated from OpenCode agents.

Usage:
  scripts/install-copilot.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>  Install destination (default: ~/.copilot/agents)
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing *.agent.md files
  -h, --help       Show this help
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_AGENTS="${REPO_ROOT}/opencode/agents"
EXPORT_SCRIPT="${REPO_ROOT}/scripts/export-copilot-agents.py"

if [[ ! -d "${SOURCE_AGENTS}" ]]; then
  echo "Source agents directory not found: ${SOURCE_AGENTS}" >&2
  exit 1
fi
if [[ ! -f "${EXPORT_SCRIPT}" ]]; then
  echo "Export script not found: ${EXPORT_SCRIPT}" >&2
  exit 1
fi

TARGET_DIR="${HOME}/.copilot/agents"

DRY_RUN=0
NO_BACKUP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --target" >&2
        exit 2
      fi
      TARGET_DIR="$2"
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

PYTHON_BIN="python3"
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python runtime not found. Install python3 or python." >&2
  exit 1
fi

echo "Source agents: ${SOURCE_AGENTS}"
echo "Target: ${TARGET_DIR}"
echo "DryRun: ${DRY_RUN}"

if [[ ${NO_BACKUP} -eq 0 && -d "${TARGET_DIR}" ]]; then
  shopt -s nullglob
  existing=("${TARGET_DIR}"/*.agent.md)
  shopt -u nullglob
  if [[ ${#existing[@]} -gt 0 ]]; then
    backup_dir="${TARGET_DIR}/.backup-agents-pipeline-copilot-$(date +%Y%m%d-%H%M%S)"
    if [[ ${DRY_RUN} -eq 1 ]]; then
      echo "Would create backup: ${backup_dir}"
    else
      mkdir -p "${backup_dir}"
      for f in "${existing[@]}"; do
        cp -a "${f}" "${backup_dir}/"
      done
      echo "Backup created: ${backup_dir}"
    fi
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would ensure target directory exists: ${TARGET_DIR}"
else
  mkdir -p "${TARGET_DIR}"
fi

EXPORT_CMD=(
  "${PYTHON_BIN}" "${EXPORT_SCRIPT}"
  --source-agents "${SOURCE_AGENTS}"
  --target-dir "${TARGET_DIR}"
  --strict
)
if [[ ${DRY_RUN} -eq 1 ]]; then
  EXPORT_CMD+=(--dry-run)
fi
"${EXPORT_CMD[@]}"

echo
echo "Suggested VS Code settings.json snippet:"
echo "{"
echo "  \"chat.agentFilesLocations\": ["
echo "    \"${TARGET_DIR}\""
echo "  ]"
echo "}"

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were written."
else
  echo "Install complete."
fi
