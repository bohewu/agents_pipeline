# SOURCES

This handoff uses the following upstream facts and design constraints.

## OpenCode

### Server / API

- `opencode serve` runs a headless HTTP server that exposes an OpenAPI endpoint.
- Default server host/port are `127.0.0.1:4096` unless configured.
- `OPENCODE_SERVER_PASSWORD` enables HTTP Basic Auth for `opencode serve` / `opencode web`.
- The server exposes APIs for global health/events, project, config, provider, sessions, messages, commands, files, agents, auth, and events.

Reference:

```text
https://opencode.ai/docs/server/
```

### SDK

- `@opencode-ai/sdk` can start both server and client through `createOpencode()`.
- It can connect to an existing server through `createOpencodeClient({ baseUrl })`.
- SDK types are generated from OpenCode's OpenAPI specification.

Reference:

```text
https://opencode.ai/docs/sdk/
```

### Config / custom config directory

- OpenCode supports global config and project config.
- `OPENCODE_CONFIG_DIR` can specify a custom config directory searched for agents, commands, modes, and plugins.
- v3 does not set `OPENCODE_CONFIG_DIR` by default because the product should consume the user's normal local OpenCode configuration.

Reference:

```text
https://opencode.ai/docs/config/
```

### Commands

- Custom commands can be defined as markdown files in `commands/`.
- Commands may be global or per-project.

Reference:

```text
https://opencode.ai/docs/commands/
```

### Agents

- OpenCode supports primary agents and subagents.
- Built-in primary agents include build and plan; users can define specialized agents.

Reference:

```text
https://opencode.ai/docs/agents/
```

### Plugins

- Plugins can be loaded from project-level or global plugin directories.
- Plugin files can hook into OpenCode behavior.

Reference:

```text
https://opencode.ai/docs/plugins/
```

## assistant-ui

### ExternalStoreRuntime

- `ExternalStoreRuntime` is suitable when the app owns state, thread management, persistence, synchronization, and custom message formats.
- It bridges custom app state to assistant-ui components.

Reference:

```text
https://www.assistant-ui.com/docs/runtimes/custom/external-store
```

## Existing assets from source repo

The source repo already contains assets that should be packaged/installed, but not referenced by source path at runtime.

### effort-control plugin

Source paths at build/install time:

```text
opencode/plugins/effort-control.js
opencode/plugins/effort-control/state.js
```

Observed behavior:

- Plugin hooks `chat.params`.
- It resolves project root from OpenCode `worktree` / `directory` / `process.cwd()`.
- It writes state under `<projectRoot>/.opencode/effort-control.sessions.json`.
- It writes trace under `<projectRoot>/.opencode/effort-control.trace.jsonl`.
- It supports effort levels `medium`, `high`, `xhigh`.
- UI `max` should map to `xhigh`.
- Supported providers include `openai` and `github-copilot`.

### provider usage tool

Source path at build/install time:

```text
opencode/tools/provider-usage.py
```

Observed behavior:

- Supports Codex and Copilot usage inspection.
- Supports JSON format.
- Supports Copilot report file.
- Discovers local credentials/cache where available.

### usage command

Source path at build/install time:

```text
opencode/commands/usage.md
```

Runtime rule:

- The web Usage drawer must execute the installed Python tool in JSON mode directly.
- The slash command can exist for OpenCode command compatibility, but UI must not parse its natural-language output.

