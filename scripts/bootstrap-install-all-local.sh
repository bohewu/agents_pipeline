#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Download a release bundle and run install-all-local.sh without cloning this repository.

Usage:
  scripts/bootstrap-install-all-local.sh [options]

Options:
  --repo <owner/repo>          GitHub repository (default: bohewu/agents_pipeline)
  --version <value>            Release tag (for example: v0.5.1) or latest (default: latest)
  --opencode-target <path>     Override OpenCode core install target
  --plugin-target <path>       Override OpenCode status plugin entry file target
  --copilot-target <path>      Override Copilot agents install target
  --claude-target <path>       Override Claude agents install target
  --codex-target <path>        Override Codex config install target
  --no-backup                  Do not back up existing installed files
  --force-codex                Allow overwrite when target contains non-generated Codex files
  --dry-run                    Resolve release and print actions only
  --keep-temp                  Keep downloaded temporary files
  -h, --help                   Show this help

Includes supported repo deliverables installable from the release bundle, including the OpenCode-only status plugin.
EOF
}

verify_bundle() {
  local bundle_dir="$1"
  local required_paths=(
    "${bundle_dir}/opencode/plugins/status-runtime.js"
    "${bundle_dir}/opencode/plugins/status-runtime"
    "${bundle_dir}/scripts/install-all-local.sh"
    "${bundle_dir}/scripts/install-plugin-status-runtime.sh"
    "${bundle_dir}/scripts/install.sh"
    "${bundle_dir}/scripts/install-copilot.sh"
    "${bundle_dir}/scripts/install-claude.sh"
    "${bundle_dir}/scripts/install-codex.sh"
  )
  local required_path
  for required_path in "${required_paths[@]}"; do
    if [[ ! -e "${required_path}" ]]; then
      echo "Bundle verification failed. Missing required path: ${required_path}" >&2
      exit 1
    fi
  done
}

resolve_bundle_dir() {
  local extract_dir="$1"
  if [[ -d "${extract_dir}/scripts" && -d "${extract_dir}/opencode" ]]; then
    printf '%s\n' "${extract_dir}"
    return 0
  fi
  shopt -s nullglob dotglob
  local candidates=("${extract_dir}"/*)
  shopt -u nullglob dotglob
  if [[ ${#candidates[@]} -eq 1 && -d "${candidates[0]}" ]]; then
    printf '%s\n' "${candidates[0]}"
    return 0
  fi
  return 1
}

normalize_bundle_permissions() {
  local bundle_dir="$1"
  local path

  shopt -s nullglob
  for path in "${bundle_dir}/scripts"/*.sh; do
    chmod u+rwx,go+rx "${path}" 2>/dev/null || true
  done
  for path in "${bundle_dir}/scripts"/*.py; do
    chmod u+rwx,go+rx "${path}" 2>/dev/null || true
  done
  shopt -u nullglob
}

REPO="bohewu/agents_pipeline"
VERSION="latest"
OPENCODE_TARGET=""
PLUGIN_TARGET=""
COPILOT_TARGET=""
CLAUDE_TARGET=""
CODEX_TARGET=""
NO_BACKUP=0
FORCE_CODEX=0
DRY_RUN=0
KEEP_TEMP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --repo" >&2
        exit 2
      fi
      REPO="$2"
      shift 2
      ;;
    --version)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --version" >&2
        exit 2
      fi
      VERSION="$2"
      shift 2
      ;;
    --opencode-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --opencode-target" >&2
        exit 2
      fi
      OPENCODE_TARGET="$2"
      shift 2
      ;;
    --plugin-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --plugin-target" >&2
        exit 2
      fi
      PLUGIN_TARGET="$2"
      shift 2
      ;;
    --copilot-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --copilot-target" >&2
        exit 2
      fi
      COPILOT_TARGET="$2"
      shift 2
      ;;
    --claude-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --claude-target" >&2
        exit 2
      fi
      CLAUDE_TARGET="$2"
      shift 2
      ;;
    --codex-target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --codex-target" >&2
        exit 2
      fi
      CODEX_TARGET="$2"
      shift 2
      ;;
    --no-backup)
      NO_BACKUP=1
      shift
      ;;
    --force-codex)
      FORCE_CODEX=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --keep-temp)
      KEEP_TEMP=1
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

for target_value in "${OPENCODE_TARGET}" "${PLUGIN_TARGET}" "${COPILOT_TARGET}" "${CLAUDE_TARGET}" "${CODEX_TARGET}"; do
  if [[ -n "${target_value}" && "${target_value}" == -* ]]; then
    echo "Target path '${target_value}' looks like a switch, not a filesystem path. Pass the explicit target flag with a path value." >&2
    exit 2
  fi
done

if [[ "${VERSION}" == "latest" ]]; then
  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
else
  if [[ "${VERSION}" == v* ]]; then
    TAG="${VERSION}"
  else
    TAG="v${VERSION}"
  fi
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
fi

echo "Release API: ${API_URL}"

JSON="$(curl -fsSL -H "Accept: application/vnd.github+json" "${API_URL}")"
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Missing Python interpreter: install python3 or python." >&2
  exit 1
fi

PARSED_URLS="$(
  JSON_PAYLOAD="${JSON}" "${PYTHON_BIN}" - <<'PY'
import json
import os
import re
import sys

data = json.loads(os.environ["JSON_PAYLOAD"])
asset_pattern = re.compile(r"agents-pipeline-opencode-bundle-.*\.tar\.gz$")
sums_pattern = re.compile(r"agents-pipeline-opencode-bundle-.*\.SHA256SUMS\.txt$")

asset_url = ""
sums_url = ""

for asset in data.get("assets", []):
    if not isinstance(asset, dict):
        continue
    url = asset.get("browser_download_url")
    if not isinstance(url, str):
        continue
    if not asset_url and asset_pattern.search(url):
        asset_url = url
    if not sums_url and sums_pattern.search(url):
        sums_url = url
    if asset_url and sums_url:
        break

sys.stdout.write(f"{asset_url}\t{sums_url}")
PY
)"
IFS=$'\t' read -r ASSET_URL SUMS_URL <<<"${PARSED_URLS}"

if [[ -z "${ASSET_URL}" ]]; then
  echo "No release tar.gz asset found matching agents-pipeline-opencode-bundle-*.tar.gz" >&2
  exit 1
fi
if [[ -z "${SUMS_URL}" ]]; then
  echo "No checksum asset found matching agents-pipeline-opencode-bundle-*.SHA256SUMS.txt" >&2
  exit 1
fi

echo "Selected asset: ${ASSET_URL}"
echo "Checksum asset: ${SUMS_URL}"
echo "Install scope: all supported bundle deliverables"

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were downloaded or installed."
  exit 0
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agents-pipeline-bootstrap-all-local.XXXXXX")"
ASSET_NAME="$(basename "${ASSET_URL}")"
SUMS_NAME="$(basename "${SUMS_URL}")"
ARCHIVE_PATH="${TMP_DIR}/${ASSET_NAME}"
SUMS_PATH="${TMP_DIR}/${SUMS_NAME}"
EXTRACT_DIR="${TMP_DIR}/extract"

cleanup() {
  if [[ ${KEEP_TEMP} -eq 0 && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

mkdir -p "${EXTRACT_DIR}"
curl -fsSL "${ASSET_URL}" -o "${ARCHIVE_PATH}"
curl -fsSL "${SUMS_URL}" -o "${SUMS_PATH}"

EXPECTED_HASH="$(awk -v target="${ASSET_NAME}" 'NF>=2 {name=$NF; sub(/^\*/, "", name); if(name==target){print $1; exit}}' "${SUMS_PATH}")"
if [[ -z "${EXPECTED_HASH}" ]]; then
  echo "Could not find checksum for ${ASSET_NAME} in ${SUMS_NAME}" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_HASH="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_HASH="$(shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')"
else
  echo "Missing checksum utility: install sha256sum or shasum." >&2
  exit 1
fi

if [[ "${ACTUAL_HASH,,}" != "${EXPECTED_HASH,,}" ]]; then
  echo "Checksum verification failed for ${ASSET_NAME}" >&2
  echo "Expected: ${EXPECTED_HASH}" >&2
  echo "Actual:   ${ACTUAL_HASH}" >&2
  exit 1
fi

echo "Checksum verified: ${ASSET_NAME}"

tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_DIR}"

if ! BUNDLE_DIR="$(resolve_bundle_dir "${EXTRACT_DIR}")"; then
  echo "Bundle root directory not found after extraction." >&2
  exit 1
fi

normalize_bundle_permissions "${BUNDLE_DIR}"

verify_bundle "${BUNDLE_DIR}"

INSTALL_SCRIPT="${BUNDLE_DIR}/scripts/install-all-local.sh"
INSTALL_CMD=(bash "${INSTALL_SCRIPT}")
if [[ -n "${OPENCODE_TARGET}" ]]; then
  INSTALL_CMD+=(--opencode-target "${OPENCODE_TARGET}")
fi
if [[ -n "${PLUGIN_TARGET}" ]]; then
  INSTALL_CMD+=(--plugin-target "${PLUGIN_TARGET}")
fi
if [[ -n "${COPILOT_TARGET}" ]]; then
  INSTALL_CMD+=(--copilot-target "${COPILOT_TARGET}")
fi
if [[ -n "${CLAUDE_TARGET}" ]]; then
  INSTALL_CMD+=(--claude-target "${CLAUDE_TARGET}")
fi
if [[ -n "${CODEX_TARGET}" ]]; then
  INSTALL_CMD+=(--codex-target "${CODEX_TARGET}")
fi
if [[ ${NO_BACKUP} -eq 1 ]]; then
  INSTALL_CMD+=(--no-backup)
fi
if [[ ${FORCE_CODEX} -eq 1 ]]; then
  INSTALL_CMD+=(--force-codex)
fi

"${INSTALL_CMD[@]}"
