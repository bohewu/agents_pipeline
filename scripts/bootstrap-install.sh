#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Download a release bundle and run install.sh without cloning this repository.

Usage:
  scripts/bootstrap-install.sh [--repo <owner/repo>] [--version <tag|latest>] [--target <path>] [--no-backup] [--dry-run] [--keep-temp]

Options:
  --repo <owner/repo>   GitHub repository (default: bohewu/agents_pipeline)
  --version <value>     Release tag (for example: v0.1.0) or latest (default: latest)
  --target <path>       Install destination (forwarded to install.sh)
  --no-backup           Do not back up existing installed files
  --dry-run             Resolve release and print actions only
  --keep-temp           Keep downloaded temporary files
  -h, --help            Show this help
EOF
}

REPO="bohewu/agents_pipeline"
VERSION="latest"
TARGET=""
NO_BACKUP=0
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
    --target)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --target" >&2
        exit 2
      fi
      TARGET="$2"
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
ASSET_URL="$(
  printf '%s' "${JSON}" \
    | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+"' \
    | cut -d'"' -f4 \
    | grep -E 'agents-pipeline-opencode-bundle-.*\.tar\.gz$' \
    | head -n1 || true
)"

if [[ -z "${ASSET_URL}" ]]; then
  echo "No release tar.gz asset found matching agents-pipeline-opencode-bundle-*.tar.gz" >&2
  exit 1
fi

echo "Selected asset: ${ASSET_URL}"
if [[ -n "${TARGET}" ]]; then
  echo "Install target override: ${TARGET}"
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
  echo "Dry run complete. No files were downloaded or installed."
  exit 0
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agents-pipeline-bootstrap.XXXXXX")"
ARCHIVE_PATH="${TMP_DIR}/bundle.tar.gz"
EXTRACT_DIR="${TMP_DIR}/extract"

cleanup() {
  if [[ ${KEEP_TEMP} -eq 0 && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

mkdir -p "${EXTRACT_DIR}"
curl -fsSL "${ASSET_URL}" -o "${ARCHIVE_PATH}"
tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_DIR}"

BUNDLE_DIR="$(find "${EXTRACT_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n1)"
if [[ -z "${BUNDLE_DIR}" ]]; then
  echo "Bundle root directory not found after extraction." >&2
  exit 1
fi

INSTALL_SCRIPT="${BUNDLE_DIR}/scripts/install.sh"
if [[ ! -f "${INSTALL_SCRIPT}" ]]; then
  echo "Install script not found in bundle: ${INSTALL_SCRIPT}" >&2
  exit 1
fi

INSTALL_CMD=(bash "${INSTALL_SCRIPT}")
if [[ -n "${TARGET}" ]]; then
  INSTALL_CMD+=(--target "${TARGET}")
fi
if [[ ${NO_BACKUP} -eq 1 ]]; then
  INSTALL_CMD+=(--no-backup)
fi

"${INSTALL_CMD[@]}"
