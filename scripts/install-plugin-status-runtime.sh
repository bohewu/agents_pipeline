#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install the local OpenCode status runtime plugin from this repository.

Usage:
  scripts/install-plugin-status-runtime.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>  Install destination (default: $XDG_CONFIG_HOME/opencode/plugins/status-runtime or ~/.config/opencode/plugins/status-runtime)
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing status-runtime plugin files
  -h, --help       Show this help

Note: This plugin installer applies to OpenCode only.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/opencode/plugins/status-runtime"

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source plugin directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
  TARGET_DIR="${XDG_CONFIG_HOME}/opencode/plugins/status-runtime"
else
  TARGET_DIR="${HOME}/.config/opencode/plugins/status-runtime"
fi

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

PLUGIN_NAME="$(basename "${SOURCE_DIR}")"
TARGET_PARENT="$(dirname "${TARGET_DIR}")"

echo "Source plugin: ${SOURCE_DIR}"
echo "Target: ${TARGET_DIR}"
echo "DryRun: ${DRY_RUN}"
echo "Plugin scope: OpenCode only"

if [[ ${NO_BACKUP} -eq 0 && -d "${TARGET_DIR}" ]]; then
  backup_dir="${TARGET_PARENT}/.backup-agents-pipeline-${PLUGIN_NAME}-$(date +%Y%m%d-%H%M%S)"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would create backup: ${backup_dir}"
  else
    mkdir -p "${backup_dir}"
    cp -a "${TARGET_DIR}" "${backup_dir}/"
    echo "Backup created: ${backup_dir}"
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would ensure target directory exists: ${TARGET_DIR}"
  echo "Would sync: ${SOURCE_DIR} -> ${TARGET_DIR}"
  echo "Dry run complete. No files were written."
  exit 0
fi

mkdir -p "${TARGET_DIR}"
cp -a "${SOURCE_DIR}/." "${TARGET_DIR}/"
echo "Synced: ${SOURCE_DIR} -> ${TARGET_DIR}"
echo "Install complete. OpenCode plugin is ready at: ${TARGET_DIR}"
