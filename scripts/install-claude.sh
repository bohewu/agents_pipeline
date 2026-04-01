#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install Claude Code custom subagents generated from OpenCode agents.

Usage:
  scripts/install-claude.sh [--target <path>] [--dry-run] [--no-backup]

Options:
  --target <path>     Install destination (default: ~/.claude/agents)
  --claude-md <path>  CLAUDE.md path for runner protocol injection (default: auto-detect)
  --no-runner         Skip runner protocol injection into CLAUDE.md
  --dry-run           Print actions without writing files
  --no-backup         Skip backup of existing *.md files in the target directory
  -h, --help          Show this help

Installs current generated Claude Code subagents and removes stale generated *.md files only.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_AGENTS="${REPO_ROOT}/opencode/agents"
EXPORT_SCRIPT="${REPO_ROOT}/scripts/export-claude-agents.py"

if [[ ! -d "${SOURCE_AGENTS}" ]]; then
  echo "Source agents directory not found: ${SOURCE_AGENTS}" >&2
  exit 1
fi
if [[ ! -f "${EXPORT_SCRIPT}" ]]; then
  echo "Export script not found: ${EXPORT_SCRIPT}" >&2
  exit 1
fi

TARGET_DIR="${HOME}/.claude/agents"
CLAUDE_MD=""
DRY_RUN=0
NO_BACKUP=0

NO_RUNNER=0

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
    --claude-md)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --claude-md" >&2
        exit 2
      fi
      CLAUDE_MD="$2"
      shift 2
      ;;
    --no-runner)
      NO_RUNNER=1
      shift
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

if [[ -z "${TARGET_DIR}" ]]; then
  echo "Target path must not be empty." >&2
  exit 2
fi
if [[ "${TARGET_DIR}" == -* ]]; then
  echo "Target path '${TARGET_DIR}' looks like a switch, not a filesystem path. Pass --target explicitly if needed." >&2
  exit 2
fi
if [[ -e "${TARGET_DIR}" && ! -d "${TARGET_DIR}" ]]; then
  echo "Target path is not a directory: ${TARGET_DIR}" >&2
  exit 2
fi

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
echo "Cleanup: stale generated Claude Code subagent files only"

if [[ ${NO_BACKUP} -eq 0 && -d "${TARGET_DIR}" ]]; then
  shopt -s nullglob
  existing=("${TARGET_DIR}"/*.md)
  shopt -u nullglob
  if [[ ${#existing[@]} -gt 0 ]]; then
    backup_dir="${TARGET_DIR}/.backup-agents-pipeline-claude-$(date +%Y%m%d-%H%M%S)"
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

# Auto-detect CLAUDE.md path: sibling to the .claude/ parent of target agents dir.
# e.g. ~/.claude/agents -> ~/.claude/CLAUDE.md
#      .claude/agents   -> .claude/../CLAUDE.md (project root)
if [[ ${NO_RUNNER} -eq 0 && -z "${CLAUDE_MD}" ]]; then
  agents_parent="$(cd "$(dirname "${TARGET_DIR}")" 2>/dev/null && pwd)"
  if [[ "$(basename "${agents_parent}")" == ".claude" ]]; then
    CLAUDE_MD="${agents_parent}/CLAUDE.md"
  else
    CLAUDE_MD="${agents_parent}/CLAUDE.md"
  fi
fi

EXPORT_CMD=(
  "${PYTHON_BIN}" "${EXPORT_SCRIPT}"
  --source-agents "${SOURCE_AGENTS}"
  --target-dir "${TARGET_DIR}"
  --strict
)
if [[ ${NO_RUNNER} -eq 0 && -n "${CLAUDE_MD}" ]]; then
  EXPORT_CMD+=(--claude-md "${CLAUDE_MD}")
fi
if [[ ${DRY_RUN} -eq 1 ]]; then
  EXPORT_CMD+=(--dry-run)
fi
"${EXPORT_CMD[@]}"

echo
echo "Claude Code subagents directory: ${TARGET_DIR}"

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were written."
else
  echo "Install complete."
fi
