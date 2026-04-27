#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALLER="${REPO_ROOT}/opencode/tools/agent-profile.sh"
MODEL_SETS="${REPO_ROOT}/opencode/tools/model-sets"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

assert_contains() {
  local name="$1"
  local text="$2"
  local needle="$3"
  if [[ "${text}" != *"${needle}"* ]]; then
    echo "FAIL ${name} - expected '${needle}'" >&2
    exit 1
  fi
  echo "PASS ${name}"
}

model_tier() {
  local model_set="$1"
  local tier="$2"
  python3 - "${MODEL_SETS}/${model_set}.json" "${tier}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
print(data["tiers"][sys.argv[2]])
PY
}

output="$(bash "${INSTALLER}" list)"
assert_contains "list balanced" "${output}" "balanced"
assert_contains "list anthropic" "${output}" "anthropic"

bash "${INSTALLER}" install balanced --model-set google --workspace "${tmp}" >/tmp/agent-profile-sh-test.out
test -f "${tmp}/.opencode/.agents-pipeline-agent-profile.json"
test -f "${tmp}/.opencode/agents/reviewer.md"
assert_contains "reviewer google model" "$(<"${tmp}/.opencode/agents/reviewer.md")" "model: $(model_tier google strong)"

status="$(bash "${INSTALLER}" status --workspace "${tmp}")"
assert_contains "status balanced" "${status}" "balanced"
assert_contains "status google" "${status}" "google"

echo "UNMANAGED SENTINEL" > "${tmp}/.opencode/agents/manual-agent.md"
bash "${INSTALLER}" clear --workspace "${tmp}" >/tmp/agent-profile-sh-clear.out
test ! -f "${tmp}/.opencode/.agents-pipeline-agent-profile.json"
test ! -f "${tmp}/.opencode/agents/reviewer.md"
test -f "${tmp}/.opencode/agents/manual-agent.md"

echo "Agent profile Bash validation passed."
