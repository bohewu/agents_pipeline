#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install Codex multi-agent role config generated from OpenCode agents.

Usage:
  scripts/install-codex.sh [--target <path>] [--dry-run] [--no-backup] [--force]

Options:
  --target <path>  Install destination (default: ~/.codex)
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing config.toml and agents/*.toml
  --force          Accepted for backward compatibility; merged install is already enabled by default
  -h, --help       Show this help

Backs up current Codex files, preserves non-agent settings, replaces managed agent definitions, and removes stale managed role files.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_AGENTS="${REPO_ROOT}/opencode/agents"
MERGE_SCRIPT="${REPO_ROOT}/scripts/install-codex-config.py"

if [[ ! -d "${SOURCE_AGENTS}" ]]; then
  echo "Source agents directory not found: ${SOURCE_AGENTS}" >&2
  exit 1
fi
if [[ ! -f "${MERGE_SCRIPT}" ]]; then
  echo "Codex install helper not found: ${MERGE_SCRIPT}" >&2
  exit 1
fi

TARGET_DIR="${HOME}/.codex"
DRY_RUN=0
NO_BACKUP=0
FORCE_OVERWRITE=1

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
    --force)
      FORCE_OVERWRITE=1
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
echo "Managed merge: preserve non-agent Codex settings"
echo "Cleanup: stale managed Codex agent outputs"

if [[ ${NO_BACKUP} -eq 0 && -d "${TARGET_DIR}" ]]; then
  backup_needed=0
  if [[ -f "${TARGET_DIR}/config.toml" ]]; then
    backup_needed=1
  fi
  if [[ -f "${TARGET_DIR}/.agents-pipeline-codex-manifest.json" ]]; then
    backup_needed=1
  fi
  if [[ -d "${TARGET_DIR}/agents" ]]; then
    shopt -s nullglob
    existing_roles=("${TARGET_DIR}"/agents/*.toml)
    shopt -u nullglob
    if [[ ${#existing_roles[@]} -gt 0 ]]; then
      backup_needed=1
    fi
  fi
  if [[ ${backup_needed} -eq 1 ]]; then
    backup_dir="${TARGET_DIR}/.backup-agents-pipeline-codex-$(date +%Y%m%d-%H%M%S)"
    if [[ ${DRY_RUN} -eq 1 ]]; then
      echo "Would create backup: ${backup_dir}"
    else
      mkdir -p "${backup_dir}"
      if [[ -f "${TARGET_DIR}/config.toml" ]]; then
        cp -a "${TARGET_DIR}/config.toml" "${backup_dir}/"
      fi
      if [[ -f "${TARGET_DIR}/.agents-pipeline-codex-manifest.json" ]]; then
        cp -a "${TARGET_DIR}/.agents-pipeline-codex-manifest.json" "${backup_dir}/"
      fi
      if [[ -d "${TARGET_DIR}/agents" ]]; then
        mkdir -p "${backup_dir}/agents"
        shopt -s nullglob
        for f in "${TARGET_DIR}"/agents/*.toml; do
          cp -a "${f}" "${backup_dir}/agents/"
        done
        shopt -u nullglob
      fi
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
  "${PYTHON_BIN}" "${MERGE_SCRIPT}"
  --source-agents "${SOURCE_AGENTS}"
  --target-dir "${TARGET_DIR}"
  --strict
)
if [[ ${DRY_RUN} -eq 1 ]]; then
  EXPORT_CMD+=(--dry-run)
fi
"${EXPORT_CMD[@]}"

echo
echo "Codex usage note: invoke generated roles by name in prompts."
echo "Example: Have 'orchestrator-general' draft a plan and 'reviewer' validate the outcome."

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were written."
else
  echo "Install complete. Generated Codex config is ready at: ${TARGET_DIR}"
fi
