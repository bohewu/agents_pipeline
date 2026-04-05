#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install OpenCode assets from this repository into your local OpenCode config directory.
Repo-managed skills are also mirrored into ~/.agents/skills and ~/.claude/skills by default.

Usage:
  scripts/install.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>  Install destination (default: $XDG_CONFIG_HOME/opencode or ~/.config/opencode)
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing agents/commands/protocols/tools/skills
  -h, --help       Show this help
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_ROOT="${REPO_ROOT}/opencode"
MANIFEST_NAME=".agents-pipeline-manifest.txt"

if [[ ! -d "${SOURCE_ROOT}" ]]; then
  echo "Source directory not found: ${SOURCE_ROOT}" >&2
  exit 1
fi

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

sync_skill_mirrors() {
  local skill_source_root="$1"
  shift
  local mirror_roots=("$@")
  local skill_dirs=()
  local skill_src=""
  local skill_name=""
  local mirror_root=""
  local existing_skill=""
  local backup_dir=""
  local needs_backup=0

  if [[ ! -d "${skill_source_root}" ]]; then
    return
  fi

  while IFS= read -r skill_src; do
    skill_dirs+=("${skill_src}")
  done < <(find "${skill_source_root}" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)

  if [[ ${#skill_dirs[@]} -eq 0 ]]; then
    return
  fi

  for mirror_root in "${mirror_roots[@]}"; do
    echo "Skill mirror target: ${mirror_root}"
    needs_backup=0
    for skill_src in "${skill_dirs[@]}"; do
      skill_name="$(basename "${skill_src}")"
      if [[ -e "${mirror_root}/${skill_name}" ]]; then
        needs_backup=1
        break
      fi
    done

    if [[ ${NO_BACKUP} -eq 0 && ${needs_backup} -eq 1 ]]; then
      backup_dir="${mirror_root}/.backup-agents-pipeline-skills-$(date +%Y%m%d-%H%M%S)"
      if [[ ${DRY_RUN} -eq 1 ]]; then
        echo "Would create skill mirror backup: ${backup_dir}"
      else
        mkdir -p "${backup_dir}"
        for skill_src in "${skill_dirs[@]}"; do
          skill_name="$(basename "${skill_src}")"
          existing_skill="${mirror_root}/${skill_name}"
          if [[ -e "${existing_skill}" ]]; then
            cp -a "${existing_skill}" "${backup_dir}/${skill_name}"
          fi
        done
        echo "Skill mirror backup created: ${backup_dir}"
      fi
    fi

    if [[ ${DRY_RUN} -eq 1 ]]; then
      echo "Would ensure skill mirror root exists: ${mirror_root}"
    else
      mkdir -p "${mirror_root}"
    fi

    for skill_src in "${skill_dirs[@]}"; do
      skill_name="$(basename "${skill_src}")"
      existing_skill="${mirror_root}/${skill_name}"
      if [[ ${DRY_RUN} -eq 1 ]]; then
        echo "Would mirror skill: ${skill_src} -> ${existing_skill}"
        continue
      fi

      rm -rf "${existing_skill}"
      cp -a "${skill_src}" "${existing_skill}"
      echo "Mirrored skill: ${skill_name} -> ${existing_skill}"
    done
  done
}

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

ITEMS=(agents commands protocols tools skills)
EXAMPLE_CONFIG="${REPO_ROOT}/opencode.json.example"
MANIFEST_PATH="${TARGET_DIR}/${MANIFEST_NAME}"
CURRENT_MANAGED_FILE=""

cleanup() {
  if [[ -n "${CURRENT_MANAGED_FILE}" && -f "${CURRENT_MANAGED_FILE}" ]]; then
    rm -f "${CURRENT_MANAGED_FILE}"
  fi
}

trap cleanup EXIT

CURRENT_MANAGED_FILE="$(mktemp)"
for item in "${ITEMS[@]}"; do
  src="${SOURCE_ROOT}/${item}"
  if [[ ! -d "${src}" ]]; then
    continue
  fi
  while IFS= read -r path; do
    rel="${path#${SOURCE_ROOT}/}"
    printf '%s\n' "${rel}" >> "${CURRENT_MANAGED_FILE}"
  done < <(find "${src}" -type f | LC_ALL=C sort)
done
if [[ -f "${EXAMPLE_CONFIG}" ]]; then
  printf '%s\n' "opencode.json.example" >> "${CURRENT_MANAGED_FILE}"
fi
LC_ALL=C sort -u "${CURRENT_MANAGED_FILE}" -o "${CURRENT_MANAGED_FILE}"

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
if [[ ${needs_backup} -eq 0 && -f "${TARGET_DIR}/opencode.json.example" ]]; then
  needs_backup=1
fi
if [[ ${needs_backup} -eq 0 && -f "${MANIFEST_PATH}" ]]; then
  needs_backup=1
fi

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
    if [[ -f "${TARGET_DIR}/opencode.json.example" ]]; then
      cp -a "${TARGET_DIR}/opencode.json.example" "${backup_dir}/"
    fi
    if [[ -f "${MANIFEST_PATH}" ]]; then
      cp -a "${MANIFEST_PATH}" "${backup_dir}/"
    fi
    echo "Backup created: ${backup_dir}"
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would ensure target directory exists: ${TARGET_DIR}"
else
  mkdir -p "${TARGET_DIR}"
fi

if [[ -f "${MANIFEST_PATH}" ]]; then
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    if grep -Fxq -- "${rel}" "${CURRENT_MANAGED_FILE}"; then
      continue
    fi
    stale_path="${TARGET_DIR}/${rel}"
    if [[ ! -f "${stale_path}" ]]; then
      continue
    fi
    if [[ ${DRY_RUN} -eq 1 ]]; then
      echo "Would remove stale managed file: ${stale_path}"
      continue
    fi
    rm -f "${stale_path}"
    remove_empty_parent_dirs "${stale_path}" "${TARGET_DIR}"
    echo "Removed stale managed file: ${stale_path}"
  done < "${MANIFEST_PATH}"
elif [[ ${DRY_RUN} -eq 0 ]]; then
  echo "No previous installer manifest found; stale cleanup starts after this install."
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
  echo "Would write installer manifest: ${MANIFEST_PATH}"
else
  cp "${CURRENT_MANAGED_FILE}" "${MANIFEST_PATH}"
  echo "Updated manifest: ${MANIFEST_PATH}"
fi

sync_skill_mirrors "${SOURCE_ROOT}/skills" "${HOME}/.agents/skills" "${HOME}/.claude/skills"

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were written."
else
  echo "Install complete."
fi
