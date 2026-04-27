#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALLER="${REPO_ROOT}/opencode/tools/agent-profile.sh"

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

output="$(bash "${INSTALLER}" list)"
assert_contains "list balanced" "${output}" "balanced"
assert_contains "list anthropic" "${output}" "anthropic"

bash "${INSTALLER}" install balanced --model-set google --workspace "${tmp}" >/tmp/agent-profile-sh-test.out
test -f "${tmp}/.opencode/.agents-pipeline-agent-profile.json"
test -f "${tmp}/.opencode/agents/reviewer.md"
assert_contains "reviewer google model" "$(cat "${tmp}/.opencode/agents/reviewer.md")" "model: google/gemini-2.5-pro"

status="$(bash "${INSTALLER}" status --workspace "${tmp}")"
assert_contains "status balanced" "${status}" "balanced"
assert_contains "status google" "${status}" "google"

echo "UNMANAGED SENTINEL" > "${tmp}/.opencode/agents/manual-agent.md"
bash "${INSTALLER}" clear --workspace "${tmp}" >/tmp/agent-profile-sh-clear.out
test ! -f "${tmp}/.opencode/.agents-pipeline-agent-profile.json"
test ! -f "${tmp}/.opencode/agents/reviewer.md"
test -f "${tmp}/.opencode/agents/manual-agent.md"

echo "Agent profile Bash validation passed."
