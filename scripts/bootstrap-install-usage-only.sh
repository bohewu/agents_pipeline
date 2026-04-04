#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Download a release bundle and run install-usage-only.sh without cloning this repository.

Usage:
  scripts/bootstrap-install-usage-only.sh [options]

Options:
  --repo <owner/repo>           GitHub repository (default: bohewu/agents_pipeline)
  --version <value>             Release tag (for example: v0.5.1) or latest (default: latest)
  --opencode-target <path>      Override OpenCode target directory
  --usage-plugin-target <path>  Override OpenCode usage-status plugin entry file target
  --no-backup                   Do not back up existing installed files
  --dry-run                     Resolve release and print actions only
  --keep-temp                   Keep downloaded temporary files
  --verbose                     Show attestation verification details
  -h, --help                    Show this help
EOF
}

verify_bundle() {
  local bundle_dir="$1"
  local required_paths=(
    "${bundle_dir}/opencode/commands/usage.md"
    "${bundle_dir}/opencode/agents/usage-inspector.md"
    "${bundle_dir}/opencode/tools/provider-usage.py"
    "${bundle_dir}/opencode/tools/provider-usage.ts"
    "${bundle_dir}/opencode/plugins/usage-status.js"
    "${bundle_dir}/opencode/plugins/usage-status"
    "${bundle_dir}/scripts/install-usage-only.sh"
    "${bundle_dir}/scripts/install-plugin-usage-status.sh"
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

log_verbose() {
  if [[ ${VERBOSE:-0} -eq 1 ]]; then
    printf '%s\n' "$1"
  fi
}

verify_release_attestation() {
  local archive_path="$1"
  local repo_name="$2"
  local release_tag="$3"
  local asset_name="$4"

  if ! command -v gh >/dev/null 2>&1; then
    log_verbose "Skipping attestation verification for ${asset_name}: gh CLI not found."
    return 0
  fi
  if ! gh attestation verify --help >/dev/null 2>&1; then
    log_verbose "Skipping attestation verification for ${asset_name}: installed gh CLI does not support 'gh attestation verify'."
    return 0
  fi

  log_verbose "Verifying attestation: ${asset_name}"
  gh attestation verify "${archive_path}" \
    --repo "${repo_name}" \
    --signer-workflow "${repo_name}/.github/workflows/release-bundle.yml" \
    --source-ref "refs/tags/${release_tag}" \
    --deny-self-hosted-runners
  log_verbose "Attestation verified: ${asset_name}"
}

REPO="bohewu/agents_pipeline"
VERSION="latest"
OPENCODE_TARGET=""
USAGE_PLUGIN_TARGET=""
NO_BACKUP=0
DRY_RUN=0
KEEP_TEMP=0
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --opencode-target)
      OPENCODE_TARGET="$2"
      shift 2
      ;;
    --usage-plugin-target)
      USAGE_PLUGIN_TARGET="$2"
      shift 2
      ;;
    --no-backup)
      NO_BACKUP=1
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
    --verbose)
      VERBOSE=1
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

for target_value in "${OPENCODE_TARGET}" "${USAGE_PLUGIN_TARGET}"; do
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

PARSED_URLS="$({
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
tag_name = data.get("tag_name") if isinstance(data.get("tag_name"), str) else ""

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

sys.stdout.write(f"{asset_url}\t{sums_url}\t{tag_name}")
PY
})"
IFS=$'\t' read -r ASSET_URL SUMS_URL RELEASE_TAG <<<"${PARSED_URLS}"

if [[ -z "${ASSET_URL}" || -z "${SUMS_URL}" || -z "${RELEASE_TAG}" ]]; then
  echo "Failed to resolve release bundle metadata." >&2
  exit 1
fi

log_verbose "Resolved release tag: ${RELEASE_TAG}"
echo "Selected asset: ${ASSET_URL}"
echo "Checksum asset: ${SUMS_URL}"
echo "Install scope: usage command/tool/plugin only"

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were downloaded or installed."
  exit 0
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agents-pipeline-bootstrap-usage-only.XXXXXX")"
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
  exit 1
fi

echo "Checksum verified: ${ASSET_NAME}"
verify_release_attestation "${ARCHIVE_PATH}" "${REPO}" "${RELEASE_TAG}" "${ASSET_NAME}"

tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_DIR}"

if ! BUNDLE_DIR="$(resolve_bundle_dir "${EXTRACT_DIR}")"; then
  echo "Bundle root directory not found after extraction." >&2
  exit 1
fi

normalize_bundle_permissions "${BUNDLE_DIR}"
verify_bundle "${BUNDLE_DIR}"

INSTALL_SCRIPT="${BUNDLE_DIR}/scripts/install-usage-only.sh"
INSTALL_CMD=(bash "${INSTALL_SCRIPT}")
if [[ -n "${OPENCODE_TARGET}" ]]; then
  INSTALL_CMD+=(--opencode-target "${OPENCODE_TARGET}")
fi
if [[ -n "${USAGE_PLUGIN_TARGET}" ]]; then
  INSTALL_CMD+=(--usage-plugin-target "${USAGE_PLUGIN_TARGET}")
fi
if [[ ${NO_BACKUP} -eq 1 ]]; then
  INSTALL_CMD+=(--no-backup)
fi

"${INSTALL_CMD[@]}"
