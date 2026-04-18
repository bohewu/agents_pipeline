# TEST_PLAN — Acceptance and regression tests

## 1. Scope tests

### No status-runtime

Search must return no new implementation references except explicit exclusions in docs/tests:

```bash
rg "status-runtime|run\.started|stage\.completed|tasks\.registered|task\.updated" apps/opencode-web-client
```

Expected: no route/component/store implementation.

### No source repo runtime coupling

Search must not show runtime dependency:

```bash
rg "AGENTS_PIPELINE_ROOT|agents_pipeline|<source repo>|opencode/tools/provider-usage.py" apps/opencode-web-client/src
```

Expected: no runtime path coupling. Docs may mention it only as forbidden.

## 2. Installer tests

### Dry-run

```bash
./install.sh web-client --dry-run
```

Expected:

- prints install targets。
- makes no file changes。

### Install

```bash
./install.sh web-client --bin-dir /tmp/ocw-bin --data-dir /tmp/ocw-data --state-dir /tmp/ocw-state --config-dir /tmp/ocw-config --opencode-config-dir /tmp/ocw-opencode
```

Expected files:

```text
/tmp/ocw-bin/opencode-codex-web
/tmp/ocw-data/install-manifest.json
/tmp/ocw-data/tools/provider-usage.py
/tmp/ocw-opencode/plugins/effort-control.js
/tmp/ocw-opencode/plugins/effort-control/state.js
/tmp/ocw-opencode/commands/usage.md
```

### Idempotent reinstall

Run install twice. Expected:

- no duplicate files。
- manifest updated cleanly。
- user config preserved。

### Uninstall

```bash
./install.sh web-client --uninstall --bin-dir /tmp/ocw-bin --data-dir /tmp/ocw-data --opencode-config-dir /tmp/ocw-opencode
```

Expected:

- binary removed。
- managed assets removed only if ownership marker present。
- state/config preserved unless `--purge`.

## 3. Source repo independence

```bash
./install.sh web-client
mv /path/to/source /path/to/source.moved
opencode-codex-web --no-open --port 45678
curl http://127.0.0.1:45678/api/diagnostics/install
```

Expected:

```json
{
  "app": {
    "sourceRepoRequired": false
  }
}
```

Usage route must reference installed `provider-usage.py` path, not source repo.

## 4. Workspace tests

### Add workspace

```bash
curl -X POST http://127.0.0.1:45678/api/workspaces \
  -H 'content-type: application/json' \
  -d '{"path":"/tmp/project-a"}'
```

Expected:

- workspace id stable。
- rootRealPath canonical。
- registry persisted。

### Git root resolution

Input subdirectory of repo. Expected finalRoot = repo root unless `useExactPath`.

### Path traversal

Requests to read `../../etc/passwd` through file API must fail.

## 5. Managed OpenCode server tests

Use real OpenCode if installed; otherwise fake upstream for integration.

Expected:

- server starts with cwd = workspace root。
- health check succeeds。
- upstream Basic Auth password not exposed to browser diagnostics。
- `OPENCODE_CONFIG_DIR` not set unless explicitly configured。

## 6. BFF protocol tests

Test all API envelopes:

- success shape `{ ok: true, data }`。
- error shape `{ ok: false, error }`。
- no raw upstream base URL in response。

## 7. assistant-ui runtime tests

- messages are converted to assistant-ui thread messages。
- `onNew` calls `/chat`。
- streaming events update messages。
- abort updates running state。

## 8. Permission tests

Simulate upstream permission request.

Expected:

- inline card rendered。
- panel shows pending。
- allow/deny calls BFF route。
- resolved event updates both locations。

## 9. Diff/files tests

- mock diff response。
- UI lists changed files。
- file content API rejects outside workspace。
- file search returns normalized results。

## 10. Effort tests

### State writes

Set project default:

```bash
POST /api/workspaces/:id/effort
{ "scope": "project", "action": "set", "effort": "max" }
```

Expected file:

```json
{
  "version": 1,
  "defaults": {
    "project": {
      "effort": "xhigh"
    }
  },
  "sessions": {}
}
```

### Session override

Set session effort high. Expected session key exists.

### Clear

Clear project/session. Expected key removed.

### Compatibility

Plugin and BFF compatibility module agree on normalize behavior:

- `max` -> `xhigh`
- invalid -> rejected
- medium/high/xhigh valid

## 11. Usage tests

### Tool path

Diagnostics and route must use installed path:

```text
<dataDir>/tools/provider-usage.py
```

### JSON parsing

Mock provider-usage stdout. Expected normalized Codex/Copilot payload.

### Failure

If Python missing or tool exits nonzero:

- route returns graceful error。
- UI shows remediation。
- no token leakage。

## 12. UI smoke tests

1. Launch app。
2. Add workspace。
3. Select provider/model/agent。
4. Send ask message。
5. Run command mode。
6. Run shell mode。
7. Open Diff panel。
8. Set effort。
9. Open Usage panel。
10. Switch workspace。

Expected: app remains usable and all state is workspace-scoped.

