#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install all supported local agent/runtime assets from this repository.

Usage:
  scripts/install-all-local.sh [options]

Options:
  --opencode-target <path>  Override OpenCode core install target
  --plugin-target <path>    Override OpenCode status-runtime plugin entry file target
  --usage-plugin-target <path>
                            Override OpenCode usage-status plugin entry file target
  --effort-plugin-target <path>
                            Override OpenCode effort-control plugin entry file target
  --copilot-target <path>   Override Copilot agents install target
  --claude-target <path>    Override Claude agents install target
  --codex-target <path>     Override Codex config install target
  --dry-run                 Print actions without writing files
  --no-backup               Skip backups in underlying installers
  --force-codex             Accepted for backward compatibility; Codex overwrite is already enabled by default
  --agent-profile <name|path>
                            Forward model profile selection to Copilot/Claude/Codex installers
  --model-set <name|path>   Forward runtime model-set selection to Copilot/Claude/Codex installers
  --profile-dir <path>      Forward agent profile directory override
  --model-set-dir <path>    Forward runtime model-set directory override
  --uniform-model <model>   Forward uniform runtime model selection
  -h, --help                Show this help

Includes:
  - OpenCode core assets
  - OpenCode status-runtime plugin only (OpenCode-only; not for Claude/Copilot/Codex)
  - OpenCode usage-status plugin only (OpenCode-only; not for Claude/Copilot/Codex)
  - OpenCode effort-control plugin only (OpenCode-only; not for Claude/Copilot/Codex)
  - Copilot agents
  - Claude agents
  - Codex config
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
NO_BACKUP=0
FORCE_CODEX=0
OPENCODE_TARGET=""
PLUGIN_TARGET=""
USAGE_PLUGIN_TARGET=""
EFFORT_PLUGIN_TARGET=""
COPILOT_TARGET=""
CLAUDE_TARGET=""
CODEX_TARGET=""
AGENT_PROFILE=""
MODEL_SET=""
PROFILE_DIR=""
MODEL_SET_DIR=""
UNIFORM_MODEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode-target)
      OPENCODE_TARGET="$2"
      shift 2
      ;;
    --plugin-target)
      PLUGIN_TARGET="$2"
      shift 2
      ;;
    --usage-plugin-target)
      USAGE_PLUGIN_TARGET="$2"
      shift 2
      ;;
    --effort-plugin-target)
      EFFORT_PLUGIN_TARGET="$2"
      shift 2
      ;;
    --copilot-target)
      COPILOT_TARGET="$2"
      shift 2
      ;;
    --claude-target)
      CLAUDE_TARGET="$2"
      shift 2
      ;;
    --codex-target)
      CODEX_TARGET="$2"
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
    --force-codex)
      FORCE_CODEX=1
      shift
      ;;
    --agent-profile)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --agent-profile" >&2
        exit 2
      fi
      AGENT_PROFILE="$2"
      shift 2
      ;;
    --model-set)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --model-set" >&2
        exit 2
      fi
      MODEL_SET="$2"
      shift 2
      ;;
    --profile-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --profile-dir" >&2
        exit 2
      fi
      PROFILE_DIR="$2"
      shift 2
      ;;
    --model-set-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --model-set-dir" >&2
        exit 2
      fi
      MODEL_SET_DIR="$2"
      shift 2
      ;;
    --uniform-model)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --uniform-model" >&2
        exit 2
      fi
      UNIFORM_MODEL="$2"
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

OPEN_CODE_CMD=(bash "${SCRIPT_DIR}/install.sh")
PLUGIN_CMD=(bash "${SCRIPT_DIR}/install-plugin-status-runtime.sh")
USAGE_PLUGIN_CMD=(bash "${SCRIPT_DIR}/install-plugin-usage-status.sh")
EFFORT_PLUGIN_CMD=(bash "${SCRIPT_DIR}/install-plugin-effort-control.sh")
COPILOT_CMD=(bash "${SCRIPT_DIR}/install-copilot.sh")
CLAUDE_CMD=(bash "${SCRIPT_DIR}/install-claude.sh")
CODEX_CMD=(bash "${SCRIPT_DIR}/install-codex.sh")

if [[ ${DRY_RUN} -eq 1 ]]; then
  OPEN_CODE_CMD+=(--dry-run)
  PLUGIN_CMD+=(--dry-run)
  USAGE_PLUGIN_CMD+=(--dry-run)
  EFFORT_PLUGIN_CMD+=(--dry-run)
  COPILOT_CMD+=(--dry-run)
  CLAUDE_CMD+=(--dry-run)
  CODEX_CMD+=(--dry-run)
fi
if [[ ${NO_BACKUP} -eq 1 ]]; then
  OPEN_CODE_CMD+=(--no-backup)
  PLUGIN_CMD+=(--no-backup)
  USAGE_PLUGIN_CMD+=(--no-backup)
  EFFORT_PLUGIN_CMD+=(--no-backup)
  COPILOT_CMD+=(--no-backup)
  CLAUDE_CMD+=(--no-backup)
  CODEX_CMD+=(--no-backup)
fi

if [[ -n "${OPENCODE_TARGET}" ]]; then
  OPEN_CODE_CMD+=(--target "${OPENCODE_TARGET}")
fi
if [[ -n "${PLUGIN_TARGET}" ]]; then
  PLUGIN_CMD+=(--target "${PLUGIN_TARGET}")
elif [[ -n "${OPENCODE_TARGET}" ]]; then
  PLUGIN_CMD+=(--target "${OPENCODE_TARGET}/plugins/status-runtime.js")
fi
if [[ -n "${USAGE_PLUGIN_TARGET}" ]]; then
  USAGE_PLUGIN_CMD+=(--target "${USAGE_PLUGIN_TARGET}")
elif [[ -n "${PLUGIN_TARGET}" ]]; then
  USAGE_PLUGIN_CMD+=(--target "$(dirname "${PLUGIN_TARGET}")/usage-status.js")
elif [[ -n "${OPENCODE_TARGET}" ]]; then
  USAGE_PLUGIN_CMD+=(--target "${OPENCODE_TARGET}/plugins/usage-status.js")
fi
if [[ -n "${EFFORT_PLUGIN_TARGET}" ]]; then
  EFFORT_PLUGIN_CMD+=(--target "${EFFORT_PLUGIN_TARGET}")
elif [[ -n "${PLUGIN_TARGET}" ]]; then
  EFFORT_PLUGIN_CMD+=(--target "$(dirname "${PLUGIN_TARGET}")/effort-control.js")
elif [[ -n "${OPENCODE_TARGET}" ]]; then
  EFFORT_PLUGIN_CMD+=(--target "${OPENCODE_TARGET}/plugins/effort-control.js")
fi
if [[ -n "${COPILOT_TARGET}" ]]; then
  COPILOT_CMD+=(--target "${COPILOT_TARGET}")
fi
if [[ -n "${CLAUDE_TARGET}" ]]; then
  CLAUDE_CMD+=(--target "${CLAUDE_TARGET}")
fi
if [[ -n "${CODEX_TARGET}" ]]; then
  CODEX_CMD+=(--target "${CODEX_TARGET}")
fi
if [[ ${FORCE_CODEX} -eq 1 ]]; then
  CODEX_CMD+=(--force)
fi
append_model_flags() {
  local -n cmd_ref="$1"
  if [[ -n "${AGENT_PROFILE}" ]]; then
    cmd_ref+=(--agent-profile "${AGENT_PROFILE}")
  fi
  if [[ -n "${MODEL_SET}" ]]; then
    cmd_ref+=(--model-set "${MODEL_SET}")
  fi
  if [[ -n "${PROFILE_DIR}" ]]; then
    cmd_ref+=(--profile-dir "${PROFILE_DIR}")
  fi
  if [[ -n "${MODEL_SET_DIR}" ]]; then
    cmd_ref+=(--model-set-dir "${MODEL_SET_DIR}")
  fi
  if [[ -n "${UNIFORM_MODEL}" ]]; then
    cmd_ref+=(--uniform-model "${UNIFORM_MODEL}")
  fi
}
append_model_flags COPILOT_CMD
append_model_flags CLAUDE_CMD
append_model_flags CODEX_CMD

echo "Running local installers with shared flags: dry-run=${DRY_RUN}, no-backup=${NO_BACKUP}"
echo "Note: OpenCode plugin installation applies to OpenCode only."
echo

"${OPEN_CODE_CMD[@]}"
echo
"${PLUGIN_CMD[@]}"
echo
"${USAGE_PLUGIN_CMD[@]}"
echo
"${EFFORT_PLUGIN_CMD[@]}"
echo
"${COPILOT_CMD[@]}"
echo
"${CLAUDE_CMD[@]}"
echo
"${CODEX_CMD[@]}"

echo
if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "All local installers completed in dry-run mode."
else
  echo "All local installers completed."
fi
