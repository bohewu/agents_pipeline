#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install only the usage inspection command/tool/plugin from this repository.

Usage:
  scripts/install-usage-only.sh [options]

Options:
  --opencode-target <path>      Override OpenCode target directory
  --usage-plugin-target <path>  Override OpenCode usage-status plugin entry file target
  --dry-run                     Print actions without writing files
  --no-backup                   Skip backups in underlying installers
  -h, --help                    Show this help
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_ROOT="${REPO_ROOT}/opencode"
MANIFEST_NAME=".agents-pipeline-usage-manifest.txt"
MANAGED_PATHS=(
  "agents/usage-inspector.md"
  "commands/usage.md"
  "tools/provider-usage.ts"
  "tools/provider-usage.py"
)

if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
  OPENCODE_TARGET="${XDG_CONFIG_HOME}/opencode"
else
  OPENCODE_TARGET="${HOME}/.config/opencode"
fi

USAGE_PLUGIN_TARGET=""
DRY_RUN=0
NO_BACKUP=0

remove_empty_parent_dirs() {
  local path="$1"
  local stop_path="$2"
  local current

  current="$(dirname "${path}")"
  while [[ "${current}" != "${stop_path}" && "${current}" == "${stop_path}"/* ]]; do
    if [[ ! -d "${current}" ]]; then
      break
    fi
    if [[ -n "$(ls -A "${current}")" ]]; then
      break
    fi
    rmdir "${current}"
    current="$(dirname "${current}")"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --opencode-target" >&2
        exit 2
      fi
      OPENCODE_TARGET="$2"
      shift 2
      ;;
    --usage-plugin-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --usage-plugin-target" >&2
        exit 2
      fi
      USAGE_PLUGIN_TARGET="$2"
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

if [[ "${OPENCODE_TARGET}" == -* ]]; then
  echo "OpenCode target path '${OPENCODE_TARGET}' looks like a switch, not a filesystem path." >&2
  exit 2
fi

if [[ -z "${USAGE_PLUGIN_TARGET}" ]]; then
  USAGE_PLUGIN_TARGET="${OPENCODE_TARGET}/plugins/usage-status.js"
fi

if [[ "${USAGE_PLUGIN_TARGET}" == -* ]]; then
  echo "Usage plugin target path '${USAGE_PLUGIN_TARGET}' looks like a switch, not a filesystem path." >&2
  exit 2
fi

MANIFEST_PATH="${OPENCODE_TARGET}/${MANIFEST_NAME}"

echo "Source root: ${SOURCE_ROOT}"
echo "OpenCode target: ${OPENCODE_TARGET}"
echo "Usage plugin target: ${USAGE_PLUGIN_TARGET}"
echo "DryRun: ${DRY_RUN}"
echo "Install scope: usage command/tool/plugin only"

if [[ ${NO_BACKUP} -eq 0 ]]; then
  needs_backup=0
  for rel in "${MANAGED_PATHS[@]}"; do
    if [[ -f "${OPENCODE_TARGET}/${rel}" ]]; then
      needs_backup=1
      break
    fi
  done
  if [[ ${needs_backup} -eq 0 && -f "${MANIFEST_PATH}" ]]; then
    needs_backup=1
  fi

  if [[ ${needs_backup} -eq 1 ]]; then
    backup_dir="${OPENCODE_TARGET}/.backup-agents-pipeline-usage-$(date +%Y%m%d-%H%M%S)"
    if [[ ${DRY_RUN} -eq 1 ]]; then
      echo "Would create backup: ${backup_dir}"
    else
      mkdir -p "${backup_dir}"
      for rel in "${MANAGED_PATHS[@]}"; do
        if [[ -f "${OPENCODE_TARGET}/${rel}" ]]; then
          mkdir -p "${backup_dir}/$(dirname "${rel}")"
          cp -a "${OPENCODE_TARGET}/${rel}" "${backup_dir}/${rel}"
        fi
      done
      if [[ -f "${MANIFEST_PATH}" ]]; then
        cp -a "${MANIFEST_PATH}" "${backup_dir}/"
      fi
      echo "Backup created: ${backup_dir}"
    fi
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would ensure OpenCode target exists: ${OPENCODE_TARGET}"
else
  mkdir -p "${OPENCODE_TARGET}"
fi

if [[ -f "${MANIFEST_PATH}" ]]; then
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    keep=0
    for current in "${MANAGED_PATHS[@]}"; do
      if [[ "${current}" == "${rel}" ]]; then
        keep=1
        break
      fi
    done
    if [[ ${keep} -eq 1 ]]; then
      continue
    fi
    stale_path="${OPENCODE_TARGET}/${rel}"
    if [[ ! -f "${stale_path}" ]]; then
      continue
    fi
    if [[ ${DRY_RUN} -eq 1 ]]; then
      echo "Would remove stale managed file: ${stale_path}"
      continue
    fi
    rm -f "${stale_path}"
    remove_empty_parent_dirs "${stale_path}" "${OPENCODE_TARGET}"
    echo "Removed stale managed file: ${stale_path}"
  done < "${MANIFEST_PATH}"
fi

for rel in "${MANAGED_PATHS[@]}"; do
  source_file="${SOURCE_ROOT}/${rel}"
  target_file="${OPENCODE_TARGET}/${rel}"
  if [[ ! -f "${source_file}" ]]; then
    echo "Required source file not found: ${source_file}" >&2
    exit 1
  fi

  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would copy: ${source_file} -> ${target_file}"
    continue
  fi

  mkdir -p "$(dirname "${target_file}")"
  cp -f "${source_file}" "${target_file}"
  echo "Copied: ${source_file} -> ${target_file}"
done

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would write manifest: ${MANIFEST_PATH}"
else
  printf '%s\n' "${MANAGED_PATHS[@]}" > "${MANIFEST_PATH}"
  echo "Updated manifest: ${MANIFEST_PATH}"
fi

PLUGIN_CMD=(bash "${SCRIPT_DIR}/install-plugin-usage-status.sh" --target "${USAGE_PLUGIN_TARGET}")
if [[ ${DRY_RUN} -eq 1 ]]; then
  PLUGIN_CMD+=(--dry-run)
fi
if [[ ${NO_BACKUP} -eq 1 ]]; then
  PLUGIN_CMD+=(--no-backup)
fi

echo
"${PLUGIN_CMD[@]}"
echo

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Usage-only install completed in dry-run mode."
else
  echo "Usage-only install completed."
fi
