#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOVER="${REPO_ROOT}/scripts/remove-plugin-effort-control.sh"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python is required for this test." >&2
  exit 1
fi

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/agents-pipeline-remove-effort-test.XXXXXX")"
cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

write_fixture() {
  local target_file="$1"
  local config_path="$2"
  local support_dir
  support_dir="$(dirname "${target_file}")/effort-control"
  mkdir -p "${support_dir}"
  printf '%s\n' 'legacy entry' > "${target_file}"
  printf '%s\n' 'legacy support' > "${support_dir}/index.js"
  TARGET_FILE_ENV="${target_file}" CONFIG_PATH_ENV="${config_path}" SUPPORT_DIR_ENV="${support_dir}" "${PYTHON_BIN}" - <<'PY'
import json
import os
from pathlib import Path

target = Path(os.environ["TARGET_FILE_ENV"]).resolve()
config = Path(os.environ["CONFIG_PATH_ENV"])
index = (Path(os.environ["SUPPORT_DIR_ENV"]) / "index.js").resolve()
payload = {
    "$schema": "https://opencode.ai/tui.json",
    "theme": "keep-me",
    "plugin": [
        "./plugins/effort-control/index.js",
        [index.as_uri(), {"legacyOption": True}],
        str(index),
        target.as_uri(),
        "https://example.invalid/plugins/effort-control/index.js",
        "./plugins/usage-status/index.js",
        ["./plugins/other/index.js", {"keep": True}],
    ],
}
config.parent.mkdir(parents=True, exist_ok=True)
config.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
}

assert_tui_preserved() {
  local config_path="$1"
  CONFIG_PATH_ENV="${config_path}" "${PYTHON_BIN}" - <<'PY'
import json
import os
from pathlib import Path

config = json.loads(Path(os.environ["CONFIG_PATH_ENV"]).read_text(encoding="utf-8"))
assert config["theme"] == "keep-me"
assert config["plugin"] == [
    "https://example.invalid/plugins/effort-control/index.js",
    "./plugins/usage-status/index.js",
    ["./plugins/other/index.js", {"keep": True}],
]
PY
}

file_digest() {
  FILE_ENV="$1" "${PYTHON_BIN}" - <<'PY'
import hashlib
import os
from pathlib import Path

print(hashlib.sha256(Path(os.environ["FILE_ENV"]).read_bytes()).hexdigest())
PY
}

default_xdg="${TMP_ROOT}/default-xdg"
default_root="${default_xdg}/opencode"
default_target="${default_root}/plugins/effort-control.js"
default_support="${default_root}/plugins/effort-control"
default_config="${default_root}/tui.json"
write_fixture "${default_target}" "${default_config}"

digest_before="$(file_digest "${default_config}")"
dry_run_output="$(XDG_CONFIG_HOME="${default_xdg}" bash "${REMOVER}" --dry-run)"
digest_after="$(file_digest "${default_config}")"
[[ "${digest_before}" == "${digest_after}" ]]
[[ -f "${default_target}" ]]
[[ -d "${default_support}" ]]
[[ "${dry_run_output}" == *"Dry run complete. No files were changed."* ]]

XDG_CONFIG_HOME="${default_xdg}" bash "${REMOVER}"
[[ ! -e "${default_target}" ]]
[[ ! -e "${default_support}" ]]
assert_tui_preserved "${default_config}"

backup_dir="$(find "${default_root}" -maxdepth 1 -type d -name '.backup-agents-pipeline-effort-control-retirement-*' -print -quit)"
[[ -n "${backup_dir}" ]]
[[ -f "${backup_dir}/effort-control.js" ]]
[[ -f "${backup_dir}/effort-control/index.js" ]]
[[ -f "${backup_dir}/tui.json" ]]

custom_root="${TMP_ROOT}/custom/opencode"
custom_target="${custom_root}/plugins/legacy-effort-entry.js"
custom_support="${custom_root}/plugins/effort-control"
custom_config="${custom_root}/tui.json"
write_fixture "${custom_target}" "${custom_config}"

bash "${REMOVER}" --target "${custom_target}" --no-backup
[[ ! -e "${custom_target}" ]]
[[ ! -e "${custom_support}" ]]
assert_tui_preserved "${custom_config}"
if find "${custom_root}" -maxdepth 1 -type d -name '.backup-agents-pipeline-effort-control-retirement-*' -print -quit | grep -q .; then
  echo "--no-backup unexpectedly created a retirement backup." >&2
  exit 1
fi

bash "${REMOVER}" --target "${custom_target}" --no-backup

if bash "${REMOVER}" --target --no-backup --dry-run >/dev/null 2>&1; then
  echo "A switch-like cleanup target should be rejected." >&2
  exit 1
fi

echo "Bash effort-control retirement tests passed."
