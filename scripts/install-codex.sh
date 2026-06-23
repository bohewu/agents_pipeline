#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install Codex multi-agent role config generated from OpenCode agents.

Usage:
  scripts/install-codex.sh [--target <path>] [--workspace-root <path>] [--global-agents-target <path>] [--dry-run] [--no-backup] [--force] [model profile options]

Options:
  --target <path>  Install destination (default: ~/.codex)
  --workspace-root <path>
                    Workspace root for safe AGENTS.md managed-block merging when target is <workspace>/.codex
  --global-agents-target <path>
                    Codex home directory whose AGENTS file receives the managed global block
  --dry-run        Print actions without writing files
  --no-backup      Skip backup of existing config.toml, agents/*.toml, and managed AGENTS.md files
  --force          Accepted for backward compatibility; merged install is already enabled by default
  --agent-profile <name|path>
                  Opt in to generated per-agent model settings
  --model-set <name|path>
                  Runtime model-set to use with --agent-profile
  --profile-dir <path>
                  Agent profile directory (default: repo opencode/tools/agent-profiles)
  --model-set-dir <path>
                  Codex model-set directory (default: repo codex/tools/model-sets)
  --uniform-model <model>
                  Apply one Codex model to all generated agents
  -h, --help       Show this help

Backs up current Codex files, preserves non-agent settings, replaces managed agent definitions, and removes stale managed role files.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSET_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ -d "${ASSET_ROOT}/agents" ]]; then
  SOURCE_AGENTS="${ASSET_ROOT}/agents"
  DEFAULT_PROFILE_DIR="${ASSET_ROOT}/tools/agent-profiles"
else
  SOURCE_AGENTS="${ASSET_ROOT}/opencode/agents"
  DEFAULT_PROFILE_DIR="${ASSET_ROOT}/opencode/tools/agent-profiles"
fi
MERGE_SCRIPT="${ASSET_ROOT}/scripts/install-codex-config.py"

if [[ ! -d "${SOURCE_AGENTS}" ]]; then
  echo "Source agents directory not found: ${SOURCE_AGENTS}" >&2
  exit 1
fi
if [[ ! -f "${MERGE_SCRIPT}" ]]; then
  echo "Codex install helper not found: ${MERGE_SCRIPT}" >&2
  exit 1
fi

TARGET_DIR="${HOME}/.codex"
WORKSPACE_ROOT=""
GLOBAL_AGENTS_TARGET=""
DRY_RUN=0
NO_BACKUP=0
FORCE_OVERWRITE=1
AGENT_PROFILE=""
MODEL_SET=""
PROFILE_DIR="${DEFAULT_PROFILE_DIR}"
MODEL_SET_DIR="${ASSET_ROOT}/codex/tools/model-sets"
UNIFORM_MODEL=""
MODEL_FLAGS=0

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
    --workspace-root)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --workspace-root" >&2
        exit 2
      fi
      WORKSPACE_ROOT="$2"
      shift 2
      ;;
    --global-agents-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --global-agents-target" >&2
        exit 2
      fi
      GLOBAL_AGENTS_TARGET="$2"
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
    --agent-profile)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --agent-profile" >&2
        exit 2
      fi
      AGENT_PROFILE="$2"
      MODEL_FLAGS=1
      shift 2
      ;;
    --model-set)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --model-set" >&2
        exit 2
      fi
      MODEL_SET="$2"
      MODEL_FLAGS=1
      shift 2
      ;;
    --profile-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --profile-dir" >&2
        exit 2
      fi
      PROFILE_DIR="$2"
      MODEL_FLAGS=1
      shift 2
      ;;
    --model-set-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --model-set-dir" >&2
        exit 2
      fi
      MODEL_SET_DIR="$2"
      MODEL_FLAGS=1
      shift 2
      ;;
    --uniform-model)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --uniform-model" >&2
        exit 2
      fi
      UNIFORM_MODEL="$2"
      MODEL_FLAGS=1
      shift 2
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

resolve_workspace_agents_path() {
  "${PYTHON_BIN}" - "$1" "$2" <<'PY'
from pathlib import Path
import sys

target_dir = Path(sys.argv[1]).expanduser().resolve()
workspace_root = Path(sys.argv[2]).expanduser().resolve()
expected_target = (workspace_root / ".codex").resolve()
if target_dir == expected_target:
    print((workspace_root / "AGENTS.md").as_posix())
PY
}

resolve_global_agents_path() {
  "${PYTHON_BIN}" - "$1" <<'PY'
from pathlib import Path
import sys

target_dir = Path(sys.argv[1]).expanduser().resolve()
override_path = target_dir / "AGENTS.override.md"
if override_path.is_file() and override_path.read_text(encoding="utf-8").strip():
    print(override_path.as_posix())
else:
    print((target_dir / "AGENTS.md").as_posix())
PY
}

WORKSPACE_AGENTS_PATH=""
if [[ -z "${GLOBAL_AGENTS_TARGET}" && -n "${WORKSPACE_ROOT}" ]]; then
  WORKSPACE_AGENTS_PATH="$(resolve_workspace_agents_path "${TARGET_DIR}" "${WORKSPACE_ROOT}")"
fi
GLOBAL_AGENTS_MERGE_PATH=""
GLOBAL_AGENTS_MERGE_DIR="${TARGET_DIR}"
if [[ -n "${GLOBAL_AGENTS_TARGET}" ]]; then
  GLOBAL_AGENTS_MERGE_DIR="${GLOBAL_AGENTS_TARGET}"
fi
if [[ -n "${GLOBAL_AGENTS_TARGET}" || -z "${WORKSPACE_AGENTS_PATH}" ]]; then
  GLOBAL_AGENTS_MERGE_PATH="$(resolve_global_agents_path "${GLOBAL_AGENTS_MERGE_DIR}")"
fi

echo "Source agents: ${SOURCE_AGENTS}"
echo "Target: ${TARGET_DIR}"
if [[ -n "${WORKSPACE_ROOT}" ]]; then
  echo "Workspace root: ${WORKSPACE_ROOT}"
fi
if [[ -n "${GLOBAL_AGENTS_MERGE_PATH}" ]]; then
  echo "Managed global AGENTS merge: ${GLOBAL_AGENTS_MERGE_PATH}"
fi
echo "DryRun: ${DRY_RUN}"
echo "Managed merge: preserve non-agent Codex settings"
echo "Cleanup: stale managed Codex agent outputs"

if [[ ${NO_BACKUP} -eq 0 ]]; then
  backup_needed=0
  backup_root="${TARGET_DIR}"
  if [[ ! -d "${backup_root}" ]]; then
    if [[ -n "${WORKSPACE_ROOT}" && -d "${WORKSPACE_ROOT}" ]]; then
      backup_root="${WORKSPACE_ROOT}"
    else
      backup_root="$(dirname "${TARGET_DIR}")"
    fi
  fi
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
  # The opencode support tree is generated and re-synced on every install; backing
  # it up makes repeated installs grow quickly without preserving user state.
  if [[ -n "${WORKSPACE_AGENTS_PATH}" && -f "${WORKSPACE_AGENTS_PATH}" ]]; then
    backup_needed=1
  fi
  if [[ -n "${GLOBAL_AGENTS_MERGE_PATH}" ]]; then
    if [[ -f "${GLOBAL_AGENTS_MERGE_DIR}/AGENTS.md" || -f "${GLOBAL_AGENTS_MERGE_DIR}/AGENTS.override.md" ]]; then
      backup_needed=1
    fi
  fi
  if [[ ${backup_needed} -eq 1 ]]; then
    backup_dir="${backup_root}/.backup-agents-pipeline-codex-$(date +%Y%m%d-%H%M%S)"
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
      if [[ -n "${WORKSPACE_AGENTS_PATH}" && -f "${WORKSPACE_AGENTS_PATH}" ]]; then
        cp -a "${WORKSPACE_AGENTS_PATH}" "${backup_dir}/AGENTS.md"
      fi
      if [[ -n "${GLOBAL_AGENTS_MERGE_PATH}" ]]; then
        if [[ -f "${GLOBAL_AGENTS_MERGE_DIR}/AGENTS.md" ]]; then
          cp -a "${GLOBAL_AGENTS_MERGE_DIR}/AGENTS.md" "${backup_dir}/AGENTS.md"
        fi
        if [[ -f "${GLOBAL_AGENTS_MERGE_DIR}/AGENTS.override.md" ]]; then
          cp -a "${GLOBAL_AGENTS_MERGE_DIR}/AGENTS.override.md" "${backup_dir}/AGENTS.override.md"
        fi
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
if [[ -n "${WORKSPACE_ROOT}" ]]; then
  EXPORT_CMD+=(--workspace-root "${WORKSPACE_ROOT}")
fi
if [[ -n "${GLOBAL_AGENTS_TARGET}" ]]; then
  EXPORT_CMD+=(--global-agents-target "${GLOBAL_AGENTS_TARGET}")
fi
if [[ -n "${AGENT_PROFILE}" ]]; then
  EXPORT_CMD+=(--agent-profile "${AGENT_PROFILE}")
fi
if [[ -n "${MODEL_SET}" ]]; then
  EXPORT_CMD+=(--model-set "${MODEL_SET}")
fi
if [[ ${MODEL_FLAGS} -eq 1 ]]; then
  EXPORT_CMD+=(--profile-dir "${PROFILE_DIR}" --model-set-dir "${MODEL_SET_DIR}")
fi
if [[ -n "${UNIFORM_MODEL}" ]]; then
  EXPORT_CMD+=(--uniform-model "${UNIFORM_MODEL}")
fi
"${EXPORT_CMD[@]}"

echo
if [[ -n "${GLOBAL_AGENTS_MERGE_PATH}" ]]; then
  echo "Codex usage note: installer-managed global AGENTS routing lives at ${GLOBAL_AGENTS_MERGE_PATH}."
  echo "Manual snippet reference remains in docs/codex-mapping.md#global-custom-instructions-snippet if you are not using the installer."
else
  echo "Codex usage note: the optional manual snippet is in docs/codex-mapping.md#global-custom-instructions-snippet."
fi
echo "Then use aliases like '使用flow ...' / 'use pipeline ...', or direct role-name prompts when needed."
echo "Example: Have 'orchestrator-general' draft a plan and 'reviewer' validate the outcome."

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were written."
else
  echo "Install complete. Generated Codex config is ready at: ${TARGET_DIR}"
fi
