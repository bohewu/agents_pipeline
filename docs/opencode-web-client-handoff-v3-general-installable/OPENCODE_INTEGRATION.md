# OPENCODE_INTEGRATION — OpenCode config/server/assets integration

## 1. Integration principle

The web client consumes OpenCode as an installed local system:

- OpenCode CLI/server provides coding capabilities。
- OpenCode config provides providers/models/agents/commands/plugins。
- The web client installer adds optional assets into the user's OpenCode config。
- The web client runtime does not depend on source repo paths。

## 2. OpenCode server usage

Managed mode starts:

```bash
opencode serve --hostname 127.0.0.1 --port <allocated>
```

The process cwd is selected workspace root.

Expected behavior:

- OpenCode loads global config。
- OpenCode loads selected workspace project config / `.opencode`。
- Installed global plugins/commands are available。
- Workspace-specific `.opencode` can override or extend behavior。

## 3. Environment handling

Default managed upstream env:

```ts
{
  ...process.env,
  OPENCODE_SERVER_USERNAME: 'opencode-web',
  OPENCODE_SERVER_PASSWORD: '<random-per-process>'
}
```

Do not set `OPENCODE_CONFIG_DIR` by default.

Advanced override only:

- CLI: `--opencode-config-dir <path>`
- App setting: `advanced.opencodeConfigDirOverride`
- Env: `OPENCODE_WEB_OPENCODE_CONFIG_DIR`

If override is used, diagnostics must show it explicitly.

## 4. Browser isolation

Browser only calls local BFF:

```text
http://127.0.0.1:<webPort>/api/*
```

Browser must not know:

- upstream OpenCode base URL。
- upstream Basic Auth password。
- direct `/global/event` URL。

## 5. SDK client

Use `@opencode-ai/sdk` in BFF only. If a specific SDK API is missing or changed, call upstream HTTP endpoint through BFF service wrapper and normalize response.

Do not leak SDK result shapes to frontend.

## 6. Agents

UI should display available agents from upstream config/agent API. The app does not define its own agents.

Agent selector rules:

1. Show primary agents first。
2. Show subagents as mention suggestions, not primary model selector if upstream differentiates them。
3. If selected workspace lacks the previous agent, fallback to OpenCode default。

## 7. Commands

Commands come from OpenCode config:

- built-in commands。
- global commands from user config。
- project commands from workspace `.opencode/commands`。
- installed usage command if installer added it。

Command mode should call upstream command API, not manually interpret command templates.

The only exception: the web Usage drawer must execute the installed provider-usage tool directly via BFF JSON mode, not by parsing `/usage` text.

## 8. Plugins

Installer installs effort plugin to local OpenCode config. Managed upstream automatically loads it when OpenCode starts.

Required plugin assets:

```text
plugins/effort-control.js
plugins/effort-control/state.js
```

The plugin should keep writing state/trace under selected workspace root:

```text
<workspaceRoot>/.opencode/effort-control.sessions.json
<workspaceRoot>/.opencode/effort-control.trace.jsonl
```

## 9. Effort compatibility

Web/BFF owns a compatibility module that mirrors plugin state shape.

Rules:

- UI `max` maps to internal `xhigh`。
- Valid levels: `medium`, `high`, `xhigh`。
- Supported providers: at minimum `openai`, `github-copilot`。
- Target model family: GPT-5-style model ids beginning with `gpt-5` unless plugin evolves。
- Agent exclusions should be read from compatibility constants copied from the plugin at build time or imported from a shared source inside the package.

Do not import arbitrary files from `~/.config/opencode/plugins` at runtime.

## 10. Usage-details integration

Installed web client must include:

```text
<dataDir>/tools/provider-usage.py
```

BFF executes JSON mode:

```bash
python3 provider-usage.py --provider auto --format json --project-root <workspaceRoot>
```

Provider-specific examples:

```bash
python3 provider-usage.py --provider codex --format json --project-root <workspaceRoot>
python3 provider-usage.py --provider copilot --format json --project-root <workspaceRoot>
python3 provider-usage.py --provider copilot --format json --project-root <workspaceRoot> --copilot-report <csvPath>
```

BFF normalizes output to a stable UI contract.

## 11. Auth and credentials

The web client must not implement provider OAuth in v3.

Credential assumptions:

- User has already configured OpenCode / Codex / Copilot locally。
- provider-usage tool discovers credentials from local sources and environment。
- If credentials are missing, UI shows remediation hints。

## 12. Config/source diagnostics

Diagnostics panel should explain what config source is in effect:

```text
OpenCode config dir: ~/.config/opencode
OPENCODE_CONFIG_DIR: not set
Workspace .opencode: present / absent
Installed assets: present / missing
```

Do not show `agents_pipeline` as active runtime config source.

## 13. Version drift handling

OpenCode API may change. Implement all upstream calls behind service wrappers:

```text
server/services/opencode-client-factory.ts
server/services/session-service.ts
server/services/file-service.ts
server/services/config-service.ts
server/services/event-broker.ts
```

Each wrapper should have unit tests with mocked upstream response.

## 14. Fallback behavior

If an upstream endpoint is not available:

- Show graceful diagnostics。
- Disable only the affected UI feature。
- Keep chat usable if possible。

Examples:

- files API missing → disable Files panel but keep Thread。
- diff API missing → show changed file status only。
- agent API missing → show default agent only。
- event stream missing → fallback to polling messages.

