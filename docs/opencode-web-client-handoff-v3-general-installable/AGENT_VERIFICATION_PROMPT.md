# AGENT_VERIFICATION_PROMPT

You are reviewing an implementation of the v3 OpenCode Codex-style Web Client. Verify strict compliance. Do not accept v2 repo-hosted assumptions.

## Read first

1. `README.md`
2. `CHANGELOG_FROM_V2.md`
3. `INSTALLER_MODEL.md`
4. `OPENCODE_INTEGRATION.md`
5. `API_CONTRACT.md`
6. `WORKSPACE_MODEL.md`
7. `TEST_PLAN.md`

## Blocker failures

Reject the implementation if any of these are true:

1. Runtime requires `agents_pipeline` source repo path。
2. Runtime requires `AGENTS_PIPELINE_ROOT`。
3. Managed `opencode serve` sets `OPENCODE_CONFIG_DIR` to source repo by default。
4. Usage route executes `<sourceRepo>/opencode/tools/provider-usage.py`。
5. Workspace registry is stored in the source repo。
6. Browser calls upstream OpenCode server directly。
7. `status-runtime` / pipeline run/stage/task UI is implemented。
8. No installer exists。
9. Installed app fails after source repo is moved。
10. API routes are not workspace-scoped。

## Required verification commands

Run or inspect equivalent:

```bash
rg "AGENTS_PIPELINE_ROOT|agents_pipeline" apps/opencode-web-client/src installer
rg "OPENCODE_CONFIG_DIR" apps/opencode-web-client/src installer
rg "status-runtime|run\.started|stage\.completed|tasks\.registered|task\.updated" apps/opencode-web-client/src
```

Confirm matches are either absent or only allowed as diagnostics/advanced option/docs, not runtime source dependency.

## Installer verification

Check:

- `./install.sh web-client --dry-run` works。
- `./install.sh web-client` installs CLI shim。
- install manifest exists。
- OpenCode assets installed to local config dir or specified config dir。
- repeated install is idempotent。
- uninstall removes owned files only。

## Source repo independence

Perform:

```bash
./install.sh web-client
mv <source-repo> <source-repo>.moved
opencode-codex-web --no-open --port 45678
curl http://127.0.0.1:45678/api/diagnostics/install
```

Pass only if app starts and diagnostics reports:

```json
{"sourceRepoRequired": false}
```

## Workspace verification

Check:

- Add repo A。
- Add repo B。
- Switch A/B。
- Sessions and UI state are scoped。
- Managed OpenCode processes use each repo as cwd。
- App does not write workspace registry into either repo。

## API contract verification

Check route envelopes and normalized shapes against `API_CONTRACT.md`.

No raw upstream OpenCode URL/password should appear in browser responses.

## Effort verification

Check:

- Project effort writes to selected workspace `.opencode/effort-control.sessions.json`。
- Session effort writes session key。
- UI `max` writes internal `xhigh`。
- clear removes keys。
- plugin assets are installed by installer。

## Usage verification

Check:

- Usage route runs installed tool path from app data dir。
- JSON mode only。
- `--project-root <workspaceRoot>` passed。
- Copilot report path supported。
- Missing Python/tool errors are graceful。

## UI verification

Check:

- chat-first empty state when no workspace is active。
- diagnostics。
- workspace selector。
- provider/model/agent selectors。
- ask/command/shell composer modes。
- permissions flow。
- diff/files panels。
- usage drawer。

Also verify:

- app lands in shell before workspace selection。
- opening a workspace with no history creates/opens a chat session automatically。

## Final reviewer output

Produce:

- PASS/FAIL。
- Blockers。
- Non-blocking issues。
- Evidence with command outputs。
- Required fixes.
