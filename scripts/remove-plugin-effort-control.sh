#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Remove the retired OpenCode effort-control plugin installed by agents-pipeline.

Usage:
  scripts/remove-plugin-effort-control.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>  Legacy plugin entry file (default: $XDG_CONFIG_HOME/opencode/plugins/effort-control.js or ~/.config/opencode/plugins/effort-control.js)
  --dry-run        Print cleanup actions without changing files
  --no-backup      Skip backup of files removed or changed by cleanup
  -h, --help       Show this help

This is a one-release retirement helper. It does not install or enable a plugin.
EOF
}

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
if [[ -d "${TARGET_FILE}" && ! -L "${TARGET_FILE}" ]]; then
  echo "Target path '${TARGET_FILE}' is a directory. The legacy plugin target must be an entry file path." >&2
  exit 2
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Missing Python interpreter: install python3 or python." >&2
  exit 1
fi

TARGET_PARENT="$(dirname "${TARGET_FILE}")"
TARGET_SUPPORT_DIR="${TARGET_PARENT}/effort-control"
OPENCODE_ROOT="$(dirname "${TARGET_PARENT}")"
CONFIG_PATH="${OPENCODE_ROOT}/tui.json"
TUI_INDEX_PATH="${TARGET_SUPPORT_DIR}/index.js"

inspect_or_update_tui() {
  local write_config="$1"
  CONFIG_PATH_ENV="${CONFIG_PATH}" \
    TARGET_FILE_ENV="${TARGET_FILE}" \
    TUI_INDEX_PATH_ENV="${TUI_INDEX_PATH}" \
    WRITE_CONFIG_ENV="${write_config}" \
    "${PYTHON_BIN}" - <<'PY'
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

config_path = Path(os.environ["CONFIG_PATH_ENV"])
target_path = os.path.abspath(os.environ["TARGET_FILE_ENV"])
index_path = os.path.abspath(os.environ["TUI_INDEX_PATH_ENV"])
write_config = os.environ["WRITE_CONFIG_ENV"] == "1"


def normalized_local_path(value: str):
    text = value.strip().replace("\\", "/")
    folded = text.casefold().rstrip("/")
    if folded in {
        "./plugins/effort-control/index.js",
        "plugins/effort-control/index.js",
        "./plugins/effort-control.js",
        "plugins/effort-control.js",
    }:
        return folded

    if folded.startswith("file:"):
        parsed = urlsplit(text)
        path = unquote(parsed.path).replace("\\", "/")
        if parsed.netloc and parsed.netloc.casefold() != "localhost":
            path = f"//{parsed.netloc}{path}"
        if re.match(r"^/[A-Za-z]:/", path):
            path = path[1:]
        return path.rstrip("/").casefold()

    if "://" in text:
        return None
    if text.startswith("/") or re.match(r"^[A-Za-z]:/", text):
        return text.rstrip("/").casefold()
    return None


target_folded = target_path.replace("\\", "/").rstrip("/").casefold()
index_folded = index_path.replace("\\", "/").rstrip("/").casefold()


def is_effort_control_entry(value):
    if not isinstance(value, str):
        return False
    normalized = normalized_local_path(value)
    if normalized is None:
        return False
    if normalized in {
        "./plugins/effort-control/index.js",
        "plugins/effort-control/index.js",
        "./plugins/effort-control.js",
        "plugins/effort-control.js",
        target_folded,
        index_folded,
    }:
        return True
    return normalized.endswith("/plugins/effort-control/index.js") or normalized.endswith(
        "/plugins/effort-control.js"
    )


if not config_path.is_file():
    print(0)
    raise SystemExit(0)

try:
    raw = config_path.read_text(encoding="utf-8")
    config = json.loads(raw) if raw.strip() else {}
except (OSError, UnicodeError, json.JSONDecodeError) as exc:
    print(f"Cannot safely update {config_path}: {exc}", file=sys.stderr)
    raise SystemExit(1)

if not isinstance(config, dict) or not isinstance(config.get("plugin"), list):
    print(0)
    raise SystemExit(0)

updated = []
removed = 0
for entry in config["plugin"]:
    candidate = entry
    if isinstance(entry, list) and entry:
        candidate = entry[0]
    if is_effort_control_entry(candidate):
        removed += 1
    else:
        updated.append(entry)

if removed and write_config:
    config["plugin"] = updated
    mode = stat.S_IMODE(config_path.stat().st_mode)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{config_path.name}.agents-pipeline-", dir=config_path.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(config, stream, indent=2)
            stream.write("\n")
        os.chmod(temporary_name, mode)
        os.replace(temporary_name, config_path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise

print(removed)
PY
}

CONFIG_REMOVALS="$(inspect_or_update_tui 0)"
ENTRY_EXISTS=0
SUPPORT_EXISTS=0
if [[ -e "${TARGET_FILE}" || -L "${TARGET_FILE}" ]]; then
  ENTRY_EXISTS=1
fi
if [[ -e "${TARGET_SUPPORT_DIR}" || -L "${TARGET_SUPPORT_DIR}" ]]; then
  SUPPORT_EXISTS=1
fi

echo "Legacy effort-control entry: ${TARGET_FILE}"
echo "Legacy effort-control support dir: ${TARGET_SUPPORT_DIR}"
echo "OpenCode TUI config: ${CONFIG_PATH}"
echo "Matching TUI registrations: ${CONFIG_REMOVALS}"
echo "DryRun: ${DRY_RUN}"

if [[ ${ENTRY_EXISTS} -eq 0 && ${SUPPORT_EXISTS} -eq 0 && ${CONFIG_REMOVALS} -eq 0 ]]; then
  echo "No legacy effort-control assets or TUI registrations found."
  exit 0
fi

if [[ ${NO_BACKUP} -eq 0 ]]; then
  backup_pattern="${OPENCODE_ROOT}/.backup-agents-pipeline-effort-control-retirement-$(date +%Y%m%d-%H%M%S).XXXXXX"
  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "Would create retirement backup under: ${backup_pattern}"
  else
    backup_dir="$(mktemp -d "${backup_pattern}")"
    if [[ ${ENTRY_EXISTS} -eq 1 ]]; then
      cp -a "${TARGET_FILE}" "${backup_dir}/$(basename "${TARGET_FILE}")"
    fi
    if [[ ${SUPPORT_EXISTS} -eq 1 ]]; then
      cp -a "${TARGET_SUPPORT_DIR}" "${backup_dir}/effort-control"
    fi
    if [[ ${CONFIG_REMOVALS} -gt 0 ]]; then
      cp -a "${CONFIG_PATH}" "${backup_dir}/tui.json"
    fi
    echo "Retirement backup created: ${backup_dir}"
  fi
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  if [[ ${ENTRY_EXISTS} -eq 1 ]]; then
    echo "Would remove legacy entry: ${TARGET_FILE}"
  fi
  if [[ ${SUPPORT_EXISTS} -eq 1 ]]; then
    echo "Would remove legacy support dir: ${TARGET_SUPPORT_DIR}"
  fi
  if [[ ${CONFIG_REMOVALS} -gt 0 ]]; then
    echo "Would remove ${CONFIG_REMOVALS} effort-control registration(s) from: ${CONFIG_PATH}"
  fi
  echo "Dry run complete. No files were changed."
  exit 0
fi

if [[ ${ENTRY_EXISTS} -eq 1 ]]; then
  rm -f "${TARGET_FILE}"
  echo "Removed legacy entry: ${TARGET_FILE}"
fi
if [[ ${SUPPORT_EXISTS} -eq 1 ]]; then
  rm -rf "${TARGET_SUPPORT_DIR}"
  echo "Removed legacy support dir: ${TARGET_SUPPORT_DIR}"
fi
if [[ ${CONFIG_REMOVALS} -gt 0 ]]; then
  UPDATED_REMOVALS="$(inspect_or_update_tui 1)"
  echo "Removed ${UPDATED_REMOVALS} effort-control registration(s) from: ${CONFIG_PATH}"
fi

echo "Legacy OpenCode effort-control cleanup complete."
