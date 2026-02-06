#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install OpenCode assets from this repository into your local OpenCode config directory.

Usage:
  scripts/install.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>  Install destination (default: $XDG_CONFIG_HOME/opencode or ~/.config/opencode)
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing agents/commands/protocols/tools
  -h, --help       Show this help
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_ROOT="${REPO_ROOT}/opencode"

if [[ ! -d "${SOURCE_ROOT}" ]]; then
  echo "Source directory not found: ${SOURCE_ROOT}" >&2
  exit 1
fi

if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
  TARGET_DIR="${XDG_CONFIG_HOME}/opencode"
else
  TARGET_DIR="${HOME}/.config/opencode"
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

ITEMS=(agents commands protocols tools)
EXAMPLE_CONFIG="${REPO_ROOT}/opencode.json.example"

echo "Source: ${SOURCE_ROOT}"
echo "Target: ${TARGET_DIR}"
echo "DryRun: ${DRY_RUN}"

needs_backup=0
for item in "${ITEMS[@]}"; do
  if [[ -e "${TARGET_DIR}/${item}" ]]; then
    needs_backup=1
    break
  fi
done

if [[ ${NO_BACKUP} -eq 0 && ${needs_backup} -eq 1 ]]; then
  backup_dir="${TARGET_DIR}/.backup-agents-pipeline-$(date +%Y%m%d-%H%M%S)"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would create backup: ${backup_dir}"
  else
    mkdir -p "${backup_dir}"
    for item in "${ITEMS[@]}"; do
      if [[ -e "${TARGET_DIR}/${item}" ]]; then
        cp -a "${TARGET_DIR}/${item}" "${backup_dir}/"
      fi
    done
    echo "Backup created: ${backup_dir}"
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would ensure target directory exists: ${TARGET_DIR}"
else
  mkdir -p "${TARGET_DIR}"
fi

for item in "${ITEMS[@]}"; do
  src="${SOURCE_ROOT}/${item}"
  dst="${TARGET_DIR}/${item}"
  if [[ ! -e "${src}" ]]; then
    continue
  fi

  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would sync: ${src} -> ${dst}"
    continue
  fi

  mkdir -p "${dst}"
  cp -a "${src}/." "${dst}/"
  echo "Synced: ${src} -> ${dst}"
done

if [[ -f "${EXAMPLE_CONFIG}" ]]; then
  dst="${TARGET_DIR}/opencode.json.example"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would copy: ${EXAMPLE_CONFIG} -> ${dst}"
  else
    cp -a "${EXAMPLE_CONFIG}" "${dst}"
    echo "Copied: ${dst}"
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were written."
else
  echo "Install complete."
fi
