#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install the local OpenCode effort-control plugin from this repository.

Usage:
  scripts/install-plugin-effort-control.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>  Install plugin entry file (default: $XDG_CONFIG_HOME/opencode/plugins/effort-control.js or ~/.config/opencode/plugins/effort-control.js)
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing effort-control plugin files
  -h, --help       Show this help

Note: This plugin installer applies to OpenCode only.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_ENTRY_FILE="${REPO_ROOT}/opencode/plugins/effort-control.js"
SOURCE_SUPPORT_DIR="${REPO_ROOT}/opencode/plugins/effort-control"

if [[ ! -f "${SOURCE_ENTRY_FILE}" ]]; then
  echo "Source plugin entry file not found: ${SOURCE_ENTRY_FILE}" >&2
  exit 1
fi

if [[ ! -d "${SOURCE_SUPPORT_DIR}" ]]; then
  echo "Source plugin support directory not found: ${SOURCE_SUPPORT_DIR}" >&2
  exit 1
fi

if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
  TARGET_FILE="${XDG_CONFIG_HOME}/opencode/plugins/effort-control.js"
else
  TARGET_FILE="${HOME}/.config/opencode/plugins/effort-control.js"
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
      TARGET_FILE="$2"
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

if [[ "${TARGET_FILE}" == -* ]]; then
  echo "Target path '${TARGET_FILE}' looks like a switch, not a filesystem path. Pass --target explicitly if needed." >&2
  exit 2
fi

if [[ -d "${TARGET_FILE}" ]]; then
  echo "Target path '${TARGET_FILE}' is a directory. OpenCode plugin targets must be a JS/TS entry file path." >&2
  exit 2
fi

PLUGIN_NAME="$(basename "${SOURCE_SUPPORT_DIR}")"
ENTRY_NAME="$(basename "${SOURCE_ENTRY_FILE}")"
TARGET_PARENT="$(dirname "${TARGET_FILE}")"
TARGET_SUPPORT_DIR="${TARGET_PARENT}/${PLUGIN_NAME}"
OPENCODE_ROOT="$(dirname "${TARGET_PARENT}")"
CONFIG_PATH="${OPENCODE_ROOT}/tui.json"
TUI_ENTRY_PATH="${TARGET_SUPPORT_DIR}/index.js"
RELATIVE_SPEC="./plugins/effort-control/index.js"
OLD_PLUGIN_URI="file:///$(printf '%s' "${TARGET_FILE}" | sed 's#\\#/#g' | sed 's#^\([A-Za-z]\):#\1:#')"
TUI_PLUGIN_URI="file:///$(printf '%s' "${TUI_ENTRY_PATH}" | sed 's#\\#/#g' | sed 's#^\([A-Za-z]\):#\1:#')"

echo "Source plugin entry: ${SOURCE_ENTRY_FILE}"
echo "Source plugin support dir: ${SOURCE_SUPPORT_DIR}"
echo "Target entry: ${TARGET_FILE}"
echo "Target support dir: ${TARGET_SUPPORT_DIR}"
echo "DryRun: ${DRY_RUN}"
echo "Plugin scope: OpenCode only"

if [[ ${NO_BACKUP} -eq 0 && ( -e "${TARGET_FILE}" || -e "${TARGET_SUPPORT_DIR}" ) ]]; then
  backup_dir="${TARGET_PARENT}/.backup-agents-pipeline-${PLUGIN_NAME}-$(date +%Y%m%d-%H%M%S)"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would create backup: ${backup_dir}"
  else
    mkdir -p "${backup_dir}"
    if [[ -e "${TARGET_FILE}" ]]; then
      cp -a "${TARGET_FILE}" "${backup_dir}/${ENTRY_NAME}"
    fi
    if [[ -e "${TARGET_SUPPORT_DIR}" ]]; then
      cp -a "${TARGET_SUPPORT_DIR}" "${backup_dir}/"
    fi
    echo "Backup created: ${backup_dir}"
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Would ensure plugin directory exists: ${TARGET_PARENT}"
  if [[ -e "${TARGET_SUPPORT_DIR}" ]]; then
    echo "Would replace existing support directory: ${TARGET_SUPPORT_DIR}"
  fi
  echo "Would copy entry file: ${SOURCE_ENTRY_FILE} -> ${TARGET_FILE}"
  echo "Would sync support dir: ${SOURCE_SUPPORT_DIR} -> ${TARGET_SUPPORT_DIR}"
  echo "Would register TUI plugin in config: ${CONFIG_PATH} -> ${RELATIVE_SPEC}"
  echo "Dry run complete. No files were written."
  exit 0
fi

mkdir -p "${TARGET_PARENT}"
cp -f "${SOURCE_ENTRY_FILE}" "${TARGET_FILE}"
rm -rf "${TARGET_SUPPORT_DIR}"
mkdir -p "${TARGET_SUPPORT_DIR}"
cp -a "${SOURCE_SUPPORT_DIR}/." "${TARGET_SUPPORT_DIR}/"

CONFIG_PATH_ENV="${CONFIG_PATH}" OLD_PLUGIN_URI_ENV="${OLD_PLUGIN_URI}" TUI_PLUGIN_URI_ENV="${TUI_PLUGIN_URI}" RELATIVE_SPEC_ENV="${RELATIVE_SPEC}" python - <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ["CONFIG_PATH_ENV"])
old_plugin_uri = os.environ["OLD_PLUGIN_URI_ENV"]
tui_plugin_uri = os.environ["TUI_PLUGIN_URI_ENV"]
relative_spec = os.environ["RELATIVE_SPEC_ENV"]

if config_path.exists():
    raw = config_path.read_text(encoding="utf-8").strip()
    config = json.loads(raw) if raw else {}
else:
    config = {}

if not isinstance(config, dict):
    config = {}

config.setdefault("$schema", "https://opencode.ai/tui.json")
plugins = config.get("plugin")
if not isinstance(plugins, list):
    plugins = []

updated = []
added = False
for entry in plugins:
    if isinstance(entry, str):
        if entry in {relative_spec, old_plugin_uri, tui_plugin_uri}:
            if not added:
                updated.append(relative_spec)
                added = True
            continue
        updated.append(entry)
        continue
    if isinstance(entry, list) and entry and isinstance(entry[0], str) and entry[0] in {relative_spec, old_plugin_uri, tui_plugin_uri}:
        if not added:
            updated.append([relative_spec, *entry[1:]])
            added = True
        continue
    updated.append(entry)

if not added:
    updated.append(relative_spec)

config["plugin"] = updated
config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
PY

echo "Copied entry file: ${SOURCE_ENTRY_FILE} -> ${TARGET_FILE}"
echo "Synced support dir: ${SOURCE_SUPPORT_DIR} -> ${TARGET_SUPPORT_DIR}"
echo "Registered TUI plugin: ${TUI_ENTRY_PATH}"
echo "Install complete. OpenCode effort-control plugin is ready at: ${TARGET_FILE}"
